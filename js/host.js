import { $, esc, SHAPES, showView, showSub, joinUrl } from './util.js';
import { getQuiz, validateQuiz, normalizeQuiz } from './store.js';
import { setCleanup, setLeaveGuard } from './navigation.js';
import { NETWORK, PEER_PREFIX, GRACE_MS, MAX_PLAYERS, CONNECT_TIMEOUT_MS } from './config.js';
import { secret, validClientMessage, send } from './protocol.js';
import { scoreAnswer } from './scoring.js';
'use strict';

/* The host's browser IS the game server. It opens a PeerJS peer whose id encodes
   the 6-digit game PIN; players connect directly over WebRTC data channels. */

let hostGame = null;

export function startHost(quizId) {
  const stored = getQuiz(quizId);
  if (!stored) { location.hash = 'library'; return; }
  const problems = validateQuiz(stored);
  if (problems.length) {
    alert('Corrige lo siguiente antes de organizar la partida:\n\n' + problems.join('\n'));
    location.hash = 'editor/' + stored.id;
    return;
  }
  showView('view-host');
  hostGame = new HostGame(normalizeQuiz(stored));
  hostGame.openRoom();
  setLeaveGuard(() => !hostGame || hostGame.destroyed || hostGame.phase === 'end' || confirm('¿Salir de la sala? La partida terminará para todos.'));
  setCleanup(() => { if (hostGame) { hostGame.destroy(); hostGame = null; } });
}

export class HostGame {
  constructor(quiz, { now = () => performance.now(), createPeer = (id, options) => new globalThis.Peer(id, options) } = {}) {
    this.quiz = quiz;
    this.now = now;
    this.createPeer = createPeer;
    this.connections = new Map();
    this.opened = false;
    this.retryTimer = null;
    this.beforeUnload = e => { if (!this.destroyed && this.phase !== 'end') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', this.beforeUnload);
    this.players = new Map();   // session id -> retained player state
    this.qIndex = -1;
    this.phase = 'lobby';
    this.peer = null;
    this.ticker = null;
    this.idTries = 0;
    this.destroyed = false;
  }

  /* ---------- room / connections ---------- */

  openRoom() {
    this.pin = String(Math.floor(100000 + crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * 900000));
    showSub('view-host', 'host-connecting');
    let peer;
    try { peer = this.createPeer(PEER_PREFIX + this.pin, NETWORK); }
    catch { this.fatal('No se ha podido iniciar la conexión. Recarga la página y comprueba tu conexión.'); return; }
    this.peer = peer;
    this.openTimer = setTimeout(() => { if (!this.opened) this.fatal('No se ha podido abrir la sala. Comprueba tu conexión y vuelve a intentarlo.'); }, CONNECT_TIMEOUT_MS);
    peer.on('open', () => {
      if (this.destroyed || this.peer !== peer) return;
      clearTimeout(this.openTimer);
      clearTimeout(this.retryTimer);
      $('#host-network').textContent = '';
      if (!this.opened) { this.opened = true; this.renderLobby(); }
    });
    peer.on('connection', conn => this.onConnection(conn));
    peer.on('error', err => {
      if (this.destroyed || this.peer !== peer) return;
      if (!this.opened && err.type === 'unavailable-id' && this.idTries++ < 4) {
        clearTimeout(this.openTimer);
        peer.destroy();
        this.openRoom();               // PIN collision — roll a new one
      } else if (err.type === 'peer-unavailable') {
        /* a player vanished mid-handshake; harmless */
      } else if (this.opened) {
        this.scheduleReconnect();
      } else {
        this.fatal(`No se ha podido contactar con el servicio de señalización (${err.type}). Comprueba tu conexión a Internet y vuelve a intentarlo.`);
      }
    });
    peer.on('disconnected', () => {
      if (!this.destroyed && this.peer === peer) this.scheduleReconnect();
    });
  }

  fatal(msg) {
    this.destroy();
    $('#host-error-msg').textContent = msg;
    showSub('view-host', 'host-error');
  }

  scheduleReconnect() {
    $('#host-network').textContent = 'Señalización desconectada. La partida continúa; intentando restablecer el acceso a la sala…';
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (this.peer.disconnected && !this.peer.destroyed) {
        try { this.peer.reconnect(); } catch { /* retry while the room remains alive */ }
      }
      if (this.peer.disconnected) this.scheduleReconnect();
    }, 2000);
  }

  onConnection(conn) {
    if (this.destroyed) { conn.close(); return; }
    if (this.connections.size >= MAX_PLAYERS * 2) { conn.close(); return; }
    const state = { conn, player: null, messages: 0, since: this.now() };
    this.connections.set(conn, state);
    state.timeout = setTimeout(() => conn.close(), CONNECT_TIMEOUT_MS);
    conn.on('data', d => {
      if (!this.connections.has(conn) || state.rejected) return;
      const now = this.now();
      if (now - state.since >= 1000) { state.messages = 0; state.since = now; }
      if (++state.messages > 30 || !validClientMessage(d)) { conn.close(); return; }
      this.onMessage(conn, d);
    });
    const closed = () => {
      clearTimeout(state.timeout);
      this.connections.delete(conn);
      const p = state.player;
      if (!p || p.conn !== conn || this.players.get(p.id) !== p || this.destroyed) return;
      p.conn = null;
      p.expiresAt = this.now() + GRACE_MS;
      clearTimeout(p.expiryTimer);
      p.expiryTimer = setTimeout(() => this.expirePlayer(p), GRACE_MS);
      if (this.phase === 'lobby') this.renderPlayerChips();
    };
    conn.on('close', closed);
    conn.on('error', () => { closed(); conn.close(); });
  }

  expirePlayer(p) {
    if (p.conn || this.players.get(p.id) !== p) return;
    this.players.delete(p.id);
    if (this.phase === 'lobby') this.renderPlayerChips();
    if (this.phase === 'question') this.checkAllAnswered();
  }

  onMessage(conn, d) {
    if (!validClientMessage(d)) return;
    if (d.t === 'join') this.handleJoin(conn, d);
    else if (d.t === 'a') this.handleAnswer(conn, d);
    else if (d.t === 'ping') send(conn, { t: 'pong', seq: d.seq });
  }

  reject(conn, reason) {
    send(conn, { t: 'kick', reason });
    const state = this.connections.get(conn);
    if (state) { state.rejected = true; clearTimeout(state.timeout); state.timeout = setTimeout(() => conn.close(), 200); }
  }

  handleJoin(conn, d) {
    const state = this.connections.get(conn);
    if (!state) return;
    if (state.player) { this.syncPlayer(state.player); return; }
    let p;
    if (d.session) {
      p = this.players.get(d.session.id);
      if (!p || p.token !== d.session.token || (!p.conn && this.now() >= p.expiresAt)) {
        this.reject(conn, 'La sesión ha caducado o no es válida. Vuelve a entrar para empezar con una nueva puntuación.');
        return;
      }
      clearTimeout(p.expiryTimer);
      const previous = p.conn;
      p.conn = conn;
      if (previous && previous !== conn) previous.close();
    } else {
      if (this.players.size >= MAX_PLAYERS) { this.reject(conn, 'La sala ha alcanzado su límite de participantes.'); return; }
      const name = d.name.trim();
      const taken = new Set([...this.players.values()].map(item => item.name.toLowerCase()));
      let final = name, n = 2;
      while (taken.has(final.toLowerCase())) final = `${name.slice(0, 17)} ${n++}`;
      p = { id: secret(), token: secret(), conn, name: final, score: 0, streak: 0,
        choice: null, answerMs: 0, joinedAtQ: this.qIndex, lastPts: 0, lastGotIt: false };
      this.players.set(p.id, p);
    }
    state.player = p;
    clearTimeout(state.timeout);
    send(conn, { t: 'welcome', name: p.name, inGame: this.phase !== 'lobby', session: { id: p.id, token: p.token } });
    this.syncPlayer(p);
    if (this.phase === 'lobby') this.renderPlayerChips();
  }

  questionMessage(p) {
    const q = this.question();
    return { t: 'q', i: this.qIndex, n: this.quiz.questions.length, text: q.text,
      answers: q.answers.map(a => a.text), secs: Math.max(0, (this.deadline - this.now()) / 1000), answered: p.choice !== null };
  }

  resultMessage(p) {
    const ranked = this.ranking();
    return { t: 'reveal', gotIt: p.lastGotIt, answered: p.choice !== null,
      points: p.lastPts, score: p.score, streak: p.streak, rank: ranked.indexOf(p) + 1, total: ranked.length };
  }

  syncPlayer(p) {
    if (this.phase === 'question' && this.now() >= this.deadline) this.endQuestion();
    if (this.phase === 'lobby') send(p.conn, { t: 'lobby' });
    else if (this.phase === 'end') send(p.conn, { t: 'end', rank: this.ranking().indexOf(p) + 1, total: this.players.size, score: p.score });
    else if (p.joinedAtQ === this.qIndex) send(p.conn, { t: 'wait', message: 'La partida está en curso. ¡Te incorporarás en la siguiente pregunta!' });
    else if (this.phase === 'question') send(p.conn, this.questionMessage(p));
    else send(p.conn, this.resultMessage(p));
  }

  handleAnswer(conn, d) {
    const p = this.connections.get(conn)?.player;
    if (!p || p.conn !== conn || this.phase !== 'question' || d.i !== this.qIndex) return;
    if (this.now() >= this.deadline) { this.endQuestion(); return; }
    if (p.choice !== null || p.joinedAtQ === this.qIndex) return;  // already answered / joined mid-question
    const choice = d.c;
    if (!Number.isInteger(choice) || choice < 0 || choice >= this.question().answers.length) return;
    p.choice = choice;
    p.answerMs = this.now() - this.qStartedAt;
    send(conn, { t: 'ack', i: this.qIndex });
    $('#hq-answered').textContent = this.answeredCount();
    this.checkAllAnswered();
  }

  broadcast(msg) {
    for (const p of this.players.values()) {
      send(p.conn, msg);
    }
  }

  question() { return this.quiz.questions[this.qIndex]; }
  answeredCount() { return [...this.players.values()].filter(p => p.choice !== null).length; }

  checkAllAnswered() {
    const eligible = [...this.players.values()].filter(p => p.joinedAtQ !== this.qIndex);
    if (eligible.length && eligible.every(p => p.choice !== null)) this.endQuestion();
  }

  /* ---------- lobby ---------- */

  renderLobby() {
    this.phase = 'lobby';
    showSub('view-host', 'host-lobby');
    $('#h-pin').textContent = this.pin;
    $('#h-quiz-title').textContent = this.quiz.title;
    $('#h-url').textContent = location.host + location.pathname.replace(/index\.html$/, '');
    if (typeof globalThis.qrcode === 'function') {
      const qr = globalThis.qrcode(0, 'M');
      qr.addData(joinUrl(this.pin));
      qr.make();
      $('#h-qr').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2 });
    } else {
      $('#h-qr').textContent = 'QR no disponible. Utiliza el PIN.';
    }
    this.renderPlayerChips();

    $('#h-start').onclick = () => this.startQuestion(0);
    $('#h-players').onclick = e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const p = this.players.get(chip.dataset.id);
      if (p && confirm(`¿Expulsar a ${p.name}?`)) {
        if (p.conn) this.reject(p.conn, 'El anfitrión te ha expulsado de la partida.');
        clearTimeout(p.expiryTimer);
        this.players.delete(chip.dataset.id);
        this.renderPlayerChips();
      }
    };
  }

  renderPlayerChips() {
    const chips = [...this.players.entries()]
      .map(([id, p]) => `<button type="button" class="chip" data-id="${esc(id)}" aria-label="Expulsar a ${esc(p.name)}">${esc(p.name)}${p.conn ? '' : ' (reconectando…)'}</button>`).join('');
    $('#h-players').innerHTML = chips;
    $('#h-count').textContent = this.players.size;
    $('#h-start').disabled = ![...this.players.values()].some(p => p.conn?.open);
  }

  /* ---------- question flow ---------- */

  startQuestion(i) {
    clearInterval(this.ticker);
    this.qIndex = i;
    this.phase = 'question';
    const q = this.question();
    for (const p of this.players.values()) {
      p.choice = null;
      p.answerMs = 0;
      if (p.joinedAtQ >= i) p.joinedAtQ = i - 1;   // never exclude players from future questions
    }
    /* players who joined during the lobby are eligible immediately */
    if (i === 0) for (const p of this.players.values()) p.joinedAtQ = -1;

    this.qStartedAt = this.now();
    this.deadline = this.qStartedAt + q.time * 1000;
    for (const p of this.players.values()) send(p.conn, this.questionMessage(p));

    $('#hq-progress').textContent = `Pregunta ${i + 1} de ${this.quiz.questions.length}`;
    $('#hq-text').textContent = q.text;
    $('#hq-answered').textContent = '0';
    $('#hq-grid').innerHTML = q.answers.map((a, k) => `
      <div class="answer-tile c${k}"><span class="shape">${SHAPES[k]}</span>${esc(a.text)}</div>`).join('');
    $('#hq-skip').onclick = () => this.endQuestion();
    showSub('view-host', 'host-question');

    const timerEl = $('#hq-timer');
    const endAt = this.qStartedAt + q.time * 1000;
    const tick = () => {
      const left = Math.max(0, endAt - this.now());
      timerEl.textContent = Math.ceil(left / 1000);
      timerEl.classList.toggle('low', left < 5100);
      if (left <= 0) this.endQuestion();
    };
    tick();
    this.ticker = setInterval(tick, 100);
  }

  endQuestion() {
    if (this.phase !== 'question') return;
    this.phase = 'reveal';
    clearInterval(this.ticker);

    const q = this.question();
    const correctSet = new Set(q.answers.map((a, k) => a.correct ? k : -1).filter(k => k >= 0));
    for (const p of this.players.values()) {
      if (p.joinedAtQ === this.qIndex) continue;
      p.lastGotIt = p.choice !== null && correctSet.has(p.choice);
      const result = scoreAnswer({ correct: p.lastGotIt, elapsedMs: p.answerMs,
        durationMs: q.time * 1000, mode: q.points, streak: p.streak });
      p.streak = result.streak;
      p.lastPts = result.points;
      p.score += result.points;
    }
    for (const p of this.players.values()) {
      if (p.joinedAtQ !== this.qIndex) send(p.conn, this.resultMessage(p));
    }

    /* host reveal screen: histogram + correct answers */
    const counts = q.answers.map((_, k) => [...this.players.values()].filter(p => p.choice === k).length);
    const max = Math.max(1, ...counts);
    $('#hr-text').textContent = q.text;
    $('#hr-histo').innerHTML = counts.map((c, k) => `
      <div class="bar-wrap">
        <span class="bar-count">${c}</span>
        <div class="bar c${k}" style="height:${Math.round(120 * c / max) + 6}px"></div>
        <span class="bar-shape">${SHAPES[k]}${correctSet.has(k) ? ' ✓' : ''}</span>
      </div>`).join('');
    $('#hr-grid').innerHTML = q.answers.map((a, k) => `
      <div class="answer-tile c${k} ${correctSet.has(k) ? '' : 'faded'}">
        <span class="shape">${SHAPES[k]}</span>${esc(a.text)}
        ${correctSet.has(k) ? '<span class="mark">✓</span>' : ''}
      </div>`).join('');
    showSub('view-host', 'host-reveal');

    const last = this.qIndex === this.quiz.questions.length - 1;
    $('#hr-next').textContent = last ? 'Podio 🏆' : 'Clasificación';
    $('#hr-next').onclick = () => last ? this.showPodium() : this.showScoreboard();
  }

  ranking() {
    return [...this.players.values()].sort((a, b) => b.score - a.score);
  }

  showScoreboard() {
    this.phase = 'board';
    const ranked = this.ranking().slice(0, 5);
    $('#hb-rows').innerHTML = ranked.map((p, i) => `
      <div class="board-row ${i === 0 ? 'gold' : ''}">
        <span class="rank">${i + 1}</span><span class="name">${esc(p.name)}</span>
        <span class="pts">${p.score}</span>
      </div>`).join('');
    showSub('view-host', 'host-board');
    $('#hb-next').onclick = () => this.startQuestion(this.qIndex + 1);
  }

  showPodium() {
    this.phase = 'end';
    const ranked = this.ranking();
    for (const p of ranked) {
      send(p.conn, {
        t: 'end', rank: ranked.indexOf(p) + 1, total: ranked.length, score: p.score,
      });
    }
    const step = (p, cls, place) => p ? `
      <div class="step ${cls}">
        <span class="p-name">${esc(p.name)}</span>
        <span class="p-pts">${p.score}</span>
        <div class="block">${place}</div>
      </div>` : '';
    $('#hp-podium').innerHTML =
      step(ranked[1], 's2', '2') + step(ranked[0], 's1', '1') + step(ranked[2], 's3', '3');
    $('#hp-rest').innerHTML = ranked.slice(3).map((p, i) => `
      <div class="board-row">
        <span class="rank">${i + 4}</span><span class="name">${esc(p.name)}</span>
        <span class="pts">${p.score}</span>
      </div>`).join('');
    showSub('view-host', 'host-podium');
    $('#hp-again').onclick = () => {
      for (const p of this.players.values()) { p.score = 0; p.streak = 0; }
      this.qIndex = -1;
      for (const p of this.players.values()) { p.choice = null; p.lastPts = 0; p.lastGotIt = false; p.joinedAtQ = -1; }
      this.renderLobby();
      this.broadcast({ t: 'lobby' });
    };
  }

  destroy() {
    this.destroyed = true;
    clearInterval(this.ticker);
    clearTimeout(this.retryTimer);
    clearTimeout(this.openTimer);
    window.removeEventListener('beforeunload', this.beforeUnload);
    for (const p of this.players.values()) clearTimeout(p.expiryTimer);
    for (const state of this.connections.values()) clearTimeout(state.timeout);
    if (this.peer) this.peer.destroy();
    this.connections.clear();
    this.players.clear();
  }
}
