import { $, SHAPES, esc, showSub, ordinal } from './util.js';
import { setCleanup } from './navigation.js';
import { NETWORK, PEER_PREFIX, GRACE_MS, CONNECT_TIMEOUT_MS } from './config.js';
import { validHostMessage, send } from './protocol.js';

const WAIT = '¿Ves tu nombre en la pantalla principal? Esperando a que el anfitrión empiece…';
const DROPPED = 'El anfitrión ha terminado la partida o se ha perdido la conexión.';
const player = {
  peer: null, conn: null, name: '', pin: '', qIndex: 0, ticker: null, gameOver: false,
  active: false, generation: 0, retry: null, handshake: null, heartbeat: null,
  session: null, reconnectUntil: 0, pending: null, ping: null, sequence: 0,
};
function savedSession(pin) {
  try {
    const data = JSON.parse(sessionStorage.getItem('quizparty.session.' + pin));
    return data && /^[a-f0-9]{32}$/.test(data.session?.id) && /^[a-f0-9]{32}$/.test(data.session?.token) && typeof data.name === 'string' ? data : null;
  } catch { return null; }
}
function saveSession() {
  try { sessionStorage.setItem('quizparty.session.' + player.pin, JSON.stringify({ session: player.session, name: player.name })); }
  catch { $('#player-network').textContent = 'La sesión solo se podrá recuperar mientras esta página siga abierta.'; }
}
function forgetSession() {
  try { sessionStorage.removeItem('quizparty.session.' + player.pin); } catch { /* unavailable storage */ }
  player.session = null;
}
export function playerShowJoinForm(pin) {
  playerTeardown();
  showSub('view-play', 'play-join');
  $('#p-pin').value = (pin || '').replace(/\D/g, '').slice(0, 6);
  const saved = savedSession($('#p-pin').value);
  $('#p-name').value = saved?.name || '';
  $('#p-join-err').textContent = '';
  $('#p-join').disabled = false;
  $('#play-wait .muted').textContent = WAIT;
  $('#pd-msg').textContent = DROPPED;
  $('#player-network').textContent = '';
  setCleanup(playerTeardown);
  ($('#p-pin').value ? $('#p-name') : $('#p-pin')).focus();
  if (saved) playerJoin();
}
function closeTransport() {
  player.generation++;
  clearTimeout(player.handshake);
  clearInterval(player.heartbeat);
  clearInterval(player.ticker);
  const peer = player.peer;
  player.peer = null; player.conn = null;
  if (peer) peer.destroy();
}
export function playerTeardown() {
  player.active = false;
  clearTimeout(player.retry);
  closeTransport();
  player.gameOver = false;
  player.pending = null;
  player.ping = null;
}
function playerJoin() {
  const pin = $('#p-pin').value.replace(/\D/g, '');
  const name = $('#p-name').value.trim();
  const errEl = $('#p-join-err');
  if (pin.length !== 6) { errEl.textContent = 'El PIN de la partida tiene 6 cifras.'; return; }
  if (!name) { errEl.textContent = '¡Elige un apodo!'; return; }
  playerTeardown();
  player.pin = pin; player.name = name;
  player.session = savedSession(pin)?.session || null;
  player.active = true;
  player.reconnectUntil = 0;
  $('#p-join').disabled = true;
  errEl.textContent = '';
  $('#pd-msg').textContent = DROPPED;
  connect();
}
function connect() {
  if (!player.active) return;
  closeTransport();
  const generation = player.generation;
  const current = () => player.active && player.generation === generation;
  let failed = false;
  const fail = () => {
    if (!current() || failed) return;
    failed = true;
    clearTimeout(player.handshake);
    if (!player.session) {
      playerTeardown();
      $('#p-join').disabled = false;
      $('#p-join-err').textContent = 'No se ha podido conectar. Comprueba el PIN, la conexión y que la sala siga abierta.';
      showSub('view-play', 'play-join');
      return;
    }
    player.reconnectUntil ||= performance.now() + GRACE_MS;
    if (performance.now() >= player.reconnectUntil) {
      playerTeardown(); forgetSession();
      $('#pd-msg').textContent = 'No se ha podido recuperar la conexión en 60 segundos. Vuelve a entrar en la sala.';
      showSub('view-play', 'play-dropped');
      return;
    }
    closeTransport();
    $('#pd-msg').textContent = 'Reconectando… Tu puntuación se conserva durante 60 segundos si el anfitrión sigue en la sala.';
    showSub('view-play', 'play-dropped');
    player.retry = setTimeout(connect, 1500);
  };
  let peer;
  try { peer = new globalThis.Peer(NETWORK); } catch { fail(); return; }
  player.peer = peer;
  player.handshake = setTimeout(fail, CONNECT_TIMEOUT_MS);
  peer.on('open', () => {
    if (!current() || player.conn) return;
    const conn = peer.connect(PEER_PREFIX + player.pin, { reliable: true });
    player.conn = conn;
    conn.on('open', () => {
      if (!current()) return;
      send(conn, { t: 'join', name: player.name, ...(player.session ? { session: player.session } : {}) });
    });
    conn.on('data', d => {
      if (!current() || !validHostMessage(d)) return;
      if (d.t === 'welcome') {
        clearTimeout(player.handshake);
        player.reconnectUntil = 0;
        clearInterval(player.heartbeat);
        player.ping = null;
        const pulse = () => {
          if (!current()) return;
          if (player.ping) { if (performance.now() - player.ping.at > 12000) fail(); return; }
          player.ping = { seq: ++player.sequence, at: performance.now() };
          if (!send(conn, { t: 'ping', seq: player.ping.seq })) fail();
        };
        pulse(); player.heartbeat = setInterval(pulse, 3000);
      }
      playerOnMessage(d);
    });
    conn.on('close', fail);
    conn.on('error', fail);
  });
  peer.on('error', fail);
  peer.on('disconnected', () => {
    if (!current()) return;
    if (player.conn?.open) {
      try { peer.reconnect(); } catch { /* the data channel and heartbeat remain active */ }
    } else fail();
  });
}
function resetLobby() {
  clearInterval(player.ticker);
  player.gameOver = false; player.pending = null; player.qIndex = -1;
  $('#play-wait .muted').textContent = WAIT;
  $('#pd-msg').textContent = DROPPED;
  for (const id of ['pr-points', 'pr-streak', 'pr-rank', 'pe-score']) $('#' + id).textContent = '';
  showSub('view-play', 'play-wait');
}
export function playerOnMessage(d) {
  if (!validHostMessage(d)) return;
  switch (d.t) {
    case 'welcome':
      player.session = d.session; player.name = d.name;
      saveSession();
      $('#p-join').disabled = false;
      $('#pw-name').textContent = d.name;
      $('#play-wait .muted').textContent = d.inGame ? 'Recuperando el estado de la partida…' : WAIT;
      showSub('view-play', 'play-wait');
      break;
    case 'lobby': resetLobby(); break;
    case 'wait':
      clearInterval(player.ticker);
      $('#play-wait .muted').textContent = d.message;
      showSub('view-play', 'play-wait');
      break;
    case 'pong':
      if (player.ping?.seq === d.seq) {
        const rtt = Math.round(performance.now() - player.ping.at);
        $('#player-network').textContent = `Latencia de ida y vuelta: ${rtt} ms. El tiempo de envío influye en la puntuación.`;
        player.ping = null;
      }
      break;
    case 'ack':
      if (d.i === player.qIndex) { player.pending = null; showSub('view-play', 'play-answered'); }
      break;
    case 'q': {
      player.gameOver = false;
      if (player.qIndex !== d.i) player.pending = null;
      player.qIndex = d.i;
      $('#pq-progress').textContent = `${d.i + 1} / ${d.n}`;
      $('#pq-text').textContent = d.text;
      $('#pq-grid').innerHTML = d.answers.map((a, k) => `
        <button class="answer-tile c${k}" data-c="${k}">
          <span class="shape" aria-hidden="true">${SHAPES[k]}</span><span class="atext">${esc(a)}</span>
        </button>`).join('');
      const endAt = performance.now() + d.secs * 1000;
      clearInterval(player.ticker);
      const tick = () => {
        const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
        $('#pq-timer').textContent = `${left} s`;
        if (left <= 0) {
          clearInterval(player.ticker);
          $('#pq-grid').querySelectorAll('button').forEach(button => { button.disabled = true; });
        }
      };
      player.ticker = setInterval(tick, 250); tick();
      if (d.answered) { player.pending = null; showSub('view-play', 'play-answered'); }
      else if (player.pending) { send(player.conn, player.pending); showSub('view-play', 'play-answered'); }
      else showSub('view-play', 'play-question');
      break;
    }
    case 'reveal': {
      clearInterval(player.ticker); player.pending = null;
      const box = $('#play-result');
      box.classList.remove('good', 'bad'); box.classList.add(d.gotIt ? 'good' : 'bad');
      $('#pr-verdict').textContent = d.gotIt ? '¡Correcto! ✔' : (d.answered ? 'Incorrecto ✘' : 'Se ha agotado el tiempo ⌛');
      $('#pr-points').textContent = '+' + d.points;
      $('#pr-streak').textContent = d.streak >= 2 ? `🔥 Racha de aciertos: ${d.streak}` : '';
      $('#pr-rank').textContent = `Vas en el puesto ${ordinal(d.rank)} de ${d.total}`;
      showSub('view-play', 'play-result');
      break;
    }
    case 'end':
      clearInterval(player.ticker); player.gameOver = true; player.pending = null;
      $('#pe-medal').textContent = d.rank === 1 ? '🥇' : d.rank === 2 ? '🥈' : d.rank === 3 ? '🥉' : '🎉';
      $('#pe-rank').textContent = `¡Puesto ${ordinal(d.rank)}, ${player.name}!`;
      $('#pe-score').textContent = `Puntuación final: ${d.score} puntos`;
      showSub('view-play', 'play-end');
      break;
    case 'kick':
      playerTeardown(); forgetSession();
      $('#pd-msg').textContent = d.reason;
      showSub('view-play', 'play-dropped');
      break;
  }
}
export function initPlayerEvents() {
  $('#p-join').addEventListener('click', playerJoin);
  $('#p-name').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('#p-join').disabled) playerJoin(); });
  $('#p-retry').addEventListener('click', () => playerShowJoinForm(player.pin));
  $('#pq-grid').addEventListener('click', e => {
    const btn = e.target.closest('button[data-c]');
    if (!btn || btn.disabled || player.pending || !player.conn?.open) return;
    const message = { t: 'a', i: player.qIndex, c: +btn.dataset.c };
    player.pending = message;
    if (send(player.conn, message)) showSub('view-play', 'play-answered');
    else { player.pending = null; player.conn.close(); }
  });
}
