import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { HostGame } from '../js/host.js';
import { sampleQuiz } from '../js/store.js';
import { GRACE_MS, MAX_PLAYERS } from '../js/config.js';

class Conn extends EventEmitter {
  open = true; messages = [];
  send(message) { this.messages.push(structuredClone(message)); }
  close() { if (this.open) { this.open = false; this.emit('close'); } }
}
function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { textContent: '', innerHTML: '', classList: { toggle() {} }, focus() {}, matches() { return false; }, setAttribute() {}, querySelector() { return null; } });
    return nodes.get(selector);
  };
  globalThis.document = { querySelector: node, querySelectorAll: () => [], getElementById: node };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, scrollTo() {} };
  globalThis.location = { host: 'test', origin: 'http://test', pathname: '/' };
  globalThis.qrcode = () => ({ addData() {}, make() {}, createSvgTag() { return '<svg></svg>'; } });
  let now = 0;
  const peer = new EventEmitter();
  peer.destroy = () => { peer.destroyed = true; };
  peer.reconnect = () => { peer.disconnected = false; peer.emit('open'); };
  const game = new HostGame(sampleQuiz(), { now: () => now, createPeer: () => peer });
  t.after(() => game.destroy());
  function join(name, session) {
    const conn = new Conn(); game.onConnection(conn);
    conn.emit('data', { t: 'join', name, ...(session ? { session } : {}) });
    return conn;
  }
  const session = c => c.messages.find(m => m.t === 'welcome').session;
  return { game, peer, join, session, node, advance: ms => { now += ms; }, get now() { return now; } };
}
test('signaling reconnect during a question does not reset phase, deadline or answers', t => {
  const { game, peer, join, advance } = setup(t);
  game.openRoom(); peer.emit('open');
  const a = join('Ana'); join('Luis');
  game.startQuestion(0); advance(500); a.emit('data', { t: 'a', i: 0, c: 0 });
  const deadline = game.deadline;
  peer.disconnected = true; peer.emit('disconnected'); t.mock.timers.tick(2000);
  assert.equal(game.phase, 'question'); assert.equal(game.deadline, deadline);
  assert.equal([...game.players.values()][0].choice, 0);
});
test('token resume retains answer, name and score and replaces stale connections', t => {
  const { game, join, session, advance } = setup(t);
  const a = join('Ana'); join('Luis');
  game.startQuestion(0); advance(1000); a.emit('data', { t: 'a', i: 0, c: 0 });
  const credentials = session(a); a.close(); advance(1000);
  const resumed = join('Otro nombre', credentials);
  assert.equal(game.players.size, 2);
  const p = game.players.get(credentials.id);
  assert.equal(p.name, 'Ana'); assert.equal(p.choice, 0);
  assert.equal(resumed.messages.at(-1).answered, true);
  assert.equal(resumed.messages.at(-1).secs, 18);
  game.endQuestion(); assert.equal(p.score, 975);
  resumed.close(); const next = join('Ana', credentials);
  assert.equal(next.messages.at(-1).score, 975);
  next.emit('data', { t: 'join', name: 'Again' });
  assert.equal(p.score, 975); assert.equal(game.players.size, 2);
});
test('unanswered player can resume; forged tokens and expired sessions are rejected', t => {
  const { game, join, session, advance } = setup(t);
  const a = join('Ana'), credentials = session(a);
  game.startQuestion(0); a.close(); advance(500);
  const forged = join('Intruso', { ...credentials, token: '0'.repeat(32) });
  assert.equal(forged.messages.at(-1).t, 'kick');
  const resumed = join('Ana', credentials); assert.equal(resumed.messages.at(-1).answered, false);
  resumed.close(); advance(GRACE_MS + 1);
  const expired = join('Ana', credentials); assert.equal(expired.messages.at(-1).t, 'kick');
  t.mock.timers.tick(GRACE_MS); assert.equal(game.players.size, 0);
});
test('late answers are rejected even before the interval fires; duplicate answers do not change choice', t => {
  const { game, join, advance } = setup(t);
  const a = join('Ana'), b = join('Luis'); game.startQuestion(0);
  advance(1000); a.emit('data', { t: 'a', i: 0, c: 0 }); a.emit('data', { t: 'a', i: 0, c: 1 });
  assert.equal([...game.players.values()][0].choice, 0);
  advance(19000); b.emit('data', { t: 'a', i: 0, c: 0 });
  assert.equal(game.phase, 'reveal'); assert.equal([...game.players.values()][1].score, 0);
});
test('late joiner waits and becomes eligible for the next question', t => {
  const { game, join } = setup(t);
  join('Ana'); game.startQuestion(0); const late = join('Luis');
  assert.equal(late.messages.at(-1).t, 'wait');
  late.emit('data', { t: 'a', i: 0, c: 0 }); assert.equal([...game.players.values()][1].choice, null);
  game.endQuestion(); game.startQuestion(1);
  late.emit('data', { t: 'a', i: 1, c: 0 }); assert.equal([...game.players.values()][1].choice, 0);
});
test('replay resets all retained state and notifies connected phones', t => {
  const { game, join, node } = setup(t);
  const a = join('Ana'); game.startQuestion(0); a.emit('data', { t: 'a', i: 0, c: 0 }); game.showPodium();
  node('#hp-again').onclick();
  assert.equal(a.messages.at(-1).t, 'lobby');
  assert.equal(game.qIndex, -1); assert.equal([...game.players.values()][0].score, 0);
  assert.equal([...game.players.values()][0].choice, null);
});
test('simulated group completes a question; capacity guard rejects overflow', t => {
  const { game, join, advance } = setup(t);
  const conns = Array.from({ length: MAX_PLAYERS }, (_, i) => join(`Jugador ${i}`));
  const extra = join('Extra'); assert.equal(extra.messages.at(-1).t, 'kick');
  game.startQuestion(0); advance(1000);
  conns.forEach(c => c.emit('data', { t: 'a', i: 0, c: 0 }));
  assert.equal(game.phase, 'reveal');
  assert.ok(conns.every(c => c.messages.at(-1).score === 975));
});

test('typed answers are graded by the host and solutions are withheld until reveal', t => {
  const { game, join, advance } = setup(t);
  game.quiz.questions = [
    { text: 'Selecciona', type: 'multi', time: 20, points: 'standard', explanation: 'A y C.', answers: [{ text: 'A', correct: true }, { text: 'B', correct: false }, { text: 'C', correct: true }] },
    { text: 'Ordena', type: 'order', time: 20, points: 'standard', answers: [{ text: 'Uno', correct: false }, { text: 'Dos', correct: false }, { text: 'Tres', correct: false }] },
    { text: 'Escribe', type: 'written', time: 20, points: 'standard', accepted: ['París'], answers: [] },
    { text: 'Opinión', type: 'poll', time: 20, points: 'double', answers: [{ text: 'Sí', correct: true }, { text: 'No', correct: false }] },
  ];
  const a = join('Ana'), b = join('Luis');
  game.startQuestion(0);
  const publicQuestion = a.messages.at(-1);
  assert.equal(publicQuestion.type, 'multi'); assert.equal(publicQuestion.solution, undefined); assert.equal(publicQuestion.explanation, undefined);
  advance(1000); a.emit('data', { t: 'a', i: 0, c: [0, 2] }); b.emit('data', { t: 'a', i: 0, c: [0] });
  assert.equal(a.messages.at(-1).gotIt, true); assert.equal(b.messages.at(-1).points, 0);
  assert.equal(a.messages.at(-1).explanation, 'A y C.');
  game.startQuestion(1);
  const order = a.messages.at(-1).answers;
  a.emit('data', { t: 'a', i: 1, c: ['Uno', 'Dos', 'Tres'].map(text => order.indexOf(text)) });
  game.endQuestion(); assert.equal(a.messages.at(-1).gotIt, true);
  game.startQuestion(2); a.emit('data', { t: 'a', i: 2, c: '  PARÍS ' }); game.endQuestion();
  assert.equal(a.messages.at(-1).gotIt, true);
  const p = [...game.players.values()][0], previousScore = p.score, previousStreak = p.streak;
  game.startQuestion(3); a.emit('data', { t: 'a', i: 3, c: 1 }); game.endQuestion();
  assert.equal(a.messages.at(-1).survey, true); assert.equal(p.score, previousScore); assert.equal(p.streak, previousStreak);
  assert.equal(game.report.questions.length, 4); assert.equal(game.report.questions[3].rows[0].correct, null);
});

test('room lock blocks new entries but permits authenticated resume, and capacity is enforced', t => {
  const { game, join, session } = setup(t);
  const a = join('Ana'), credentials = session(a); a.close();
  game.locked = true;
  const blocked = join('Luis'); assert.equal(blocked.messages.at(-1).t, 'kick');
  const resumed = join('Ana', credentials); assert.equal(resumed.messages.at(-1).t, 'lobby');
  game.locked = false; game.capacity = 1;
  assert.equal(join('Luis').messages.at(-1).t, 'kick');
  assert.equal(game.players.size, 1);
});

test('approval does not allocate a player until admitted and can be rejected during a question', t => {
  const { game, join } = setup(t);
  join('Ana'); game.startQuestion(0); game.approval = true;
  const waiting = join('Luis');
  assert.equal(waiting.messages.at(-1).t, 'approval'); assert.equal(game.players.size, 1);
  const request = game.pending.get(waiting); game.handleJoin(waiting, request.data, true);
  assert.equal(game.players.size, 2); assert.equal(waiting.messages.at(-1).t, 'wait');
  const refused = join('Eva'); game.reject(refused, 'Solicitud rechazada.');
  assert.equal(refused.messages.at(-1).t, 'kick'); t.mock.timers.tick(200);
  assert.equal(game.pending.size, 0);
});

test('moderation during a question revokes the session and retains report evidence', t => {
  const { game, join, session, advance } = setup(t);
  globalThis.confirm = () => true;
  const a = join('Ana'), b = join('Luis'), credentials = session(b);
  game.startQuestion(0); advance(1000); b.emit('data', { t: 'a', i: 0, c: 0 });
  game.kickPlayer(credentials.id);
  assert.equal(b.messages.at(-1).t, 'kick');
  assert.equal(join('Luis', credentials).messages.at(-1).t, 'kick');
  a.emit('data', { t: 'a', i: 0, c: 0 });
  assert.equal(game.report.questions[0].rows.length, 2);
  assert.equal(game.report.questions[0].rows.find(row => row.name === 'Luis').answered, true);
});
