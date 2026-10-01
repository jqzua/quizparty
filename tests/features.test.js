import test from 'node:test';
import assert from 'node:assert/strict';
import { validResponse, isCorrect, solutionText } from '../js/questions.js';
import { validMedia, mediaBytes, MAX_QUIZ_MEDIA } from '../js/media.js';
import { validateQuizShape } from '../js/schema.js';
import { importQuizJson, normalizeQuiz, validateQuiz } from '../js/store.js';
import { newReport, recordQuestion, summarizeParticipants, reportCSV, saveReport, readReports, csvCell } from '../js/reports.js';
const options = [{ text: 'A', correct: true }, { text: 'B', correct: false }, { text: 'C', correct: true }];
const question = (type, extra = {}) => ({ text: 'Prueba', type, answers: structuredClone(options), time: 20, points: 'standard', ...extra });
const quiz = q => ({ id: 'test', title: 'Test', questions: [q] });
const image = { kind: 'image', src: 'data:image/png;base64,aGVsbG8=', alt: 'Alternativa' };

test('multi requires the exact set, ordering requires a permutation, booleans and written answers are explicit', () => {
  assert.equal(isCorrect(question('multi'), [2, 0]), true);
  for (const response of [[0], [0, 1, 2], [0, 0], [], 0]) assert.equal(isCorrect(question('multi'), response), false);
  assert.equal(isCorrect(question('order'), [0, 1, 2]), true);
  assert.equal(isCorrect(question('order'), [1, 0, 2]), false);
  assert.equal(validResponse(question('order'), [0, 1]), false);
  assert.equal(validResponse(question('single'), '0'), false);
  const written = question('written', { answers: [], accepted: ['París', 'La ciudad de París'] });
  assert.equal(isCorrect(written, '  LA CIUDAD  de PARÍS '), true);
  assert.equal(isCorrect(written, 'Paris'), false);
  assert.equal(validResponse(written, 'a'.repeat(161)), false);
  assert.equal(isCorrect(question('poll'), 0), null);
  assert.match(solutionText(question('poll')), /no hay respuestas correctas/);
});

test('media imports enforce type, per-file and total limits, and retain content through export normalization', () => {
  assert.equal(validMedia(image), true); assert.equal(mediaBytes(image), 5);
  assert.equal(validMedia({ ...image, src: 'https://example.com/a.png' }), false);
  assert.equal(validMedia({ ...image, src: 'data:image/svg+xml;base64,aGVsbG8=' }), false);
  assert.equal(validMedia({ ...image, kind: 'video' }), false);
  assert.equal(validMedia({ ...image, src: 'data:image/png;base64,' + 'a'.repeat(1_400_000) }), false);
  const multimedia = quiz(question('multi', { explanation: 'Explicación', media: image, answers: options.map(a => ({ ...a, media: image })) }));
  const imported = importQuizJson(JSON.stringify(multimedia));
  assert.deepEqual(normalizeQuiz(imported).questions[0].media, image);
  assert.equal(imported.questions[0].explanation, 'Explicación');
  assert.deepEqual(validateQuiz(imported), []);
  imported.questions[0].media.alt = '';
  assert.ok(validateQuiz(imported).some(message => message.includes('alternativa textual')));
  const big = { kind: 'audio', src: 'data:audio/mpeg;base64,' + 'a'.repeat(2_000_000), alt: 'Transcripción' };
  assert.equal(validMedia(big), true);
  assert.equal(validateQuizShape(quiz(question('single', { media: big, answers: options.map(a => ({ ...a, media: big })) }))), false);
  assert.equal(MAX_QUIZ_MEDIA, 4 * 1024 * 1024);
});

test('reports exclude polls from accuracy, include unanswered players and resist CSV formula injection', () => {
  const report = newReport(quiz(question('single')));
  const players = [
    { id: 'a', name: '=HYPERLINK("x")', choice: 0, lastGotIt: true, lastPts: 900, answerMs: 300 },
    { id: 'b', name: 'Luis', choice: null, lastGotIt: false, lastPts: 0, answerMs: 0 },
  ];
  recordQuestion(report, question('single'), 0, players);
  recordQuestion(report, question('single'), 0, players); // idempotent
  players[0].lastPts = 0;
  recordQuestion(report, question('poll'), 1, players);
  const summary = summarizeParticipants(report);
  assert.equal(report.questions.length, 2);
  assert.deepEqual(summary.map(p => [p.graded, p.correct, p.answered]), [[1, 1, 2], [1, 0, 0]]);
  const csv = reportCSV(report);
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('No evaluable')); assert.ok(csv.includes('Resumen por pregunta'));
  assert.equal(csvCell(' +1'), '"\' +1"');
  assert.equal(csvCell('una "cita", y\nsegunda línea'), '"una ""cita"", y\nsegunda línea"');
  assert.equal(csv.includes('token'), false);
});

test('history persists, handles quota and preserves corrupt originals', () => {
  let raw = null;
  const storage = { getItem: () => raw, setItem: (_, next) => { raw = next; } };
  const report = newReport(quiz(question('single')));
  recordQuestion(report, question('single'), 0, []);
  assert.equal(saveReport(report, storage), ''); assert.equal(readReports(storage).length, 1);
  report.complete = true; assert.equal(saveReport(report, storage), ''); assert.equal(readReports(storage).length, 1);
  raw = '{broken'; assert.notEqual(saveReport(report, storage), ''); assert.equal(raw, '{broken');
  raw = null; storage.setItem = () => { throw new Error('quota'); };
  assert.match(saveReport(report, storage), /No se ha guardado/);
});
