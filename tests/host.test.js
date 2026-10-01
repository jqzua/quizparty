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
