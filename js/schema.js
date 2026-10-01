import { MAX_QUESTIONS, MAX_LIBRARY_BYTES } from './config.js';
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => typeof v === 'string' && v.length <= max;
export function validateStoredQuiz(q) {
  return object(q) && text(q.id, 100) && /^[a-zA-Z0-9-]+$/.test(q.id) && validateQuizShape(q);
}
export function validateQuizShape(q) {
  return object(q) && text(q.title, 80) && Array.isArray(q.questions) &&
    q.questions.length >= 1 && q.questions.length <= MAX_QUESTIONS && q.questions.every(item =>
      object(item) && text(item.text, 200) && [5, 10, 20, 30, 60, 90].includes(item.time) &&
      ['standard', 'double', 'none'].includes(item.points) && Array.isArray(item.answers) &&
      item.answers.length <= 4 && item.answers.every(a =>
        object(a) && text(a.text, 100) && typeof a.correct === 'boolean'));
}
export function parseLibrary(raw) {
  if (new TextEncoder().encode(raw).length > MAX_LIBRARY_BYTES) throw new Error('Biblioteca demasiado grande.');
  const data = JSON.parse(raw);
  // v1 was an unversioned array; keep the original storage key for migration.
  const quizzes = Array.isArray(data) ? data : object(data) && data.version === 2 ? data.quizzes : null;
  if (!Array.isArray(quizzes) || !quizzes.every(validateStoredQuiz) ||
      new Set(quizzes.map(q => q.id)).size !== quizzes.length) throw new Error('Biblioteca no válida o versión desconocida.');
  return quizzes;
}
