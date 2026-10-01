import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary, LS_KEY } from '../js/storage.js';
import { parseLibrary } from '../js/schema.js';
import { parseRoute } from '../js/navigation.js';
import { scoreAnswer } from '../js/scoring.js';
import { secret, validClientMessage, validHostMessage } from '../js/protocol.js';
import { sampleQuiz, importQuizJson } from '../js/store.js';
const fixture = () => [sampleQuiz()];
function memory(raw = null) {
  let value = raw;
  return { getItem: key => { assert.equal(key, LS_KEY); return value; }, setItem: (key, next) => { assert.equal(key, LS_KEY); value = next; } };
}
test('migrates the unversioned library on save, preserving IDs and content', () => {
  const quizzes = fixture(), store = memory(JSON.stringify(quizzes));
  const lib = createLibrary({ storage: () => store, seed: fixture });
  assert.deepEqual(lib.get(), quizzes);
  assert.ok(Array.isArray(JSON.parse(store.getItem(LS_KEY))));
  lib.save(quizzes);
  assert.equal(JSON.parse(store.getItem(LS_KEY)).version, 3);
  assert.deepEqual(parseLibrary(lib.backup()), quizzes);
});
test('corrupt, unsupported and wrongly shaped storage are never overwritten', () => {
  for (const raw of ['{broken', '{}', 'null', '{"version":99,"quizzes":[]}', '[null]']) {
    const store = memory(raw), notices = [];
    const lib = createLibrary({ storage: () => store, seed: fixture, notify: n => notices.push(n) });
    assert.deepEqual(lib.get(), []);
    const quizzes = fixture();
    assert.equal(lib.save(quizzes), false);
    assert.equal(store.getItem(LS_KEY), raw);
    assert.equal(lib.original(), raw);
    assert.deepEqual(parseLibrary(lib.backup()), quizzes);
    assert.ok(notices.at(-1).blocked && lib.isDirty());
  }
});
test('quota failure preserves edits in memory and retries saving', () => {
  const store = memory(JSON.stringify(fixture()));
  const original = store.setItem;
  const lib = createLibrary({ storage: () => store, seed: fixture });
  const quizzes = lib.get(); quizzes[0].title = 'Cambios pendientes';
  store.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(lib.save(quizzes), false);
  assert.equal(lib.get()[0].title, 'Cambios pendientes');
  assert.ok(lib.isDirty());
  store.setItem = original;
  assert.equal(lib.save(quizzes), true);
  assert.equal(lib.isDirty(), false);
});
test('blocked storage and concurrent tabs do not discard either version', () => {
  const blocked = createLibrary({ storage: () => { throw new Error('SecurityError'); }, seed: fixture });
  assert.deepEqual(blocked.get(), []);
  assert.equal(blocked.save(fixture()), false);
  const store = memory(JSON.stringify(fixture()));
  const lib = createLibrary({ storage: () => store, seed: fixture });
  const before = lib.get();
  const outside = JSON.stringify(fixture()); store.setItem(LS_KEY, outside);
  assert.equal(lib.save(before), false);
  assert.equal(store.getItem(LS_KEY), outside);
  assert.deepEqual(parseLibrary(lib.backup()), before);
});
test('imports reject nulls, invalid flags, huge files, question overflow and invalid durations', () => {
  const q = sampleQuiz();
  const imported = importQuizJson(JSON.stringify(q));
  assert.notEqual(imported.id, q.id);
  assert.deepEqual(imported.questions.map(({ type, explanation, accepted, media, ...item }) => item), q.questions);
  assert.equal(imported.questions[0].type, 'single');
  for (const mutation of [
    q => q.questions.push(null), q => q.questions[0].answers.push(null),
    q => q.questions[0].answers[0].correct = 'false', q => q.questions[0].time = -1,
    q => q.questions = Array(201).fill(q.questions[0]), q => q.title = 'a'.repeat(81),
  ]) { const data = structuredClone(q); mutation(data); assert.throws(() => importQuizJson(JSON.stringify(data))); }
  assert.throws(() => importQuizJson(' '.repeat(8 * 1024 * 1024 + 1)));
});
test('routes tolerate malformed encodings and reject partial or foreign routes', () => {
  for (const path of ['#%E0%A4%A', '#join/123', '#joinXYZ', '#editor/../../x', '#unknown']) assert.equal(parseRoute(path).view, 'home');
  assert.deepEqual(parseRoute('#join/123456'), { view: 'join', pin: '123456' });
  assert.deepEqual(parseRoute('#host/abc-123'), { view: 'host', id: 'abc-123' });
});
test('scoring preserves streak caps, double points and no-point rounds', () => {
  const base = { correct: true, elapsedMs: 1000, durationMs: 20000, mode: 'standard', streak: 0 };
  assert.deepEqual(scoreAnswer(base), { points: 975, streak: 1 });
  assert.equal(scoreAnswer({ ...base, mode: 'double', streak: 8 }).points, 2450);
  assert.equal(scoreAnswer({ ...base, mode: 'none', streak: 4 }).points, 0);
  assert.deepEqual(scoreAnswer({ ...base, correct: false, streak: 4 }), { points: 0, streak: 0 });
});
test('protocol rejects coerced choices, oversized and malformed messages', () => {
  assert.equal(validClientMessage({ t: 'a', i: 0, c: null }), false);
  assert.equal(validClientMessage({ t: 'a', i: 0, c: '0' }), true);
  assert.equal(validClientMessage({ t: 'join', name: 'a'.repeat(21) }), false);
  assert.equal(validHostMessage({ t: 'q', answers: null }), false);
  assert.equal(validHostMessage({ t: 'reveal', points: NaN }), false);
  assert.equal(validClientMessage({ t: 'join', name: 'Ana', session: { id: secret(), token: secret() } }), true);
});
