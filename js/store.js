import { questionType } from './questions.js';
import { quizMediaBytes, MAX_QUIZ_MEDIA } from './media.js';
import { uid, download } from './util.js';
import { createLibrary } from './storage.js';
import { validateQuizShape, parseLibrary } from './schema.js';
import { MAX_FILE_BYTES, MAX_LIBRARY_BYTES } from './config.js';
'use strict';

export const library = createLibrary({
  storage: () => localStorage, seed: () => [sampleQuiz()],
  notify: detail => document.dispatchEvent(new CustomEvent('storage-status', { detail })),
});

function sampleQuiz() {
  const q = (text, answers, correct, time = 20) => ({
    text,
    answers: answers.map((a, i) => ({ text: a, correct: correct.includes(i) })),
    time,
    points: 'standard',
  });
  return {
    id: uid(),
    title: 'Ejemplo: cultura general',
    questions: [
      q('¿Cuál es el planeta más grande del sistema solar?', ['Júpiter', 'Saturno', 'Tierra', 'Neptuno'], [0]),
      q('¿Cuál de estos es un color primario de la luz?', ['Rojo', 'Verde', 'Amarillo', 'Azul'], [0, 1, 3]),
      q('La Gran Muralla se encuentra en…', ['Japón', 'China'], [1], 10),
      q('¿Cuántos continentes hay en el modelo de siete continentes?', ['5', '6', '7', '8'], [2], 10),
      q('¿Qué lenguaje se ejecuta de forma nativa en los navegadores web?', ['Python', 'JavaScript', 'C++', 'Java'], [1]),
    ],
  };
}

function getQuizzes() { return library.get(); }
function saveQuizzes(quizzes) { return library.save(quizzes); }

function getQuiz(id) {
  return getQuizzes().find(q => q.id === id) || null;
}

function upsertQuiz(quiz) {
  const all = getQuizzes();
  const i = all.findIndex(q => q.id === quiz.id);
  if (i >= 0) all[i] = quiz; else all.push(quiz);
  saveQuizzes(all);
}

function deleteQuiz(id) {
  saveQuizzes(getQuizzes().filter(q => q.id !== id));
}

function blankQuestion() {
  return {
    text: '', type: 'single', explanation: '', accepted: [], media: null,
    answers: [
      { text: '', correct: false }, { text: '', correct: false },
      { text: '', correct: false }, { text: '', correct: false },
    ],
    time: 20,
    points: 'standard',
  };
}

function newQuiz() {
  return { id: uid(), title: '', questions: [blankQuestion()] };
}

/* Returns a list of human-readable problems; empty list = ready to host. */
function validateQuiz(quiz) {
  const problems = [];
  if (!quiz.title.trim()) problems.push('• El cuestionario necesita un título.');
  if (!quiz.questions.length) problems.push('• Añade al menos una pregunta.');
  quiz.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.text.trim()) problems.push(`• La pregunta ${n} no tiene enunciado.`);
    const type = questionType(q);
    const filled = q.answers.filter(a => a.text.trim());
    if (type === 'written') {
      if (!q.accepted?.some(a => a.trim())) problems.push(`• La pregunta ${n} necesita al menos una respuesta escrita aceptada.`);
    } else {
      if (filled.length < 2) problems.push(`• La pregunta ${n} necesita al menos 2 respuestas con texto accesible.`);
      if (['single', 'multi', 'boolean'].includes(type) && !filled.some(a => a.correct)) problems.push(`• La pregunta ${n} no tiene ninguna respuesta correcta marcada.`);
      if (type === 'boolean' && (q.answers.length !== 2 || q.answers.filter(a => a.correct).length !== 1)) problems.push(`• La pregunta ${n} debe tener exactamente una respuesta verdadera/falsa correcta.`);
    }
    for (const media of [q.media, ...q.answers.map(a => a.media)]) {
      if (media && !media.alt.trim()) problems.push(`• Añade una alternativa textual al contenido multimedia de la pregunta ${n}.`);
    }
  });
  if (quizMediaBytes(quiz) > MAX_QUIZ_MEDIA) problems.push('• El contenido multimedia del cuestionario supera 4 MB.');
  return problems;
}

/* Strip empty answer slots before playing/exporting. */
function normalizeQuiz(quiz) {
  return {
    ...quiz,
    questions: quiz.questions.map(q => ({
      ...q, type: questionType(q), explanation: q.explanation || '', accepted: q.accepted || [],
      answers: questionType(q) === 'written' ? [] : q.answers.filter(a => a.text.trim()),
    })),
  };
}

function importQuizJson(text) {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('El archivo supera el límite de 8 MB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('El archivo no contiene JSON válido.'); }
  if (!validateQuizShape(data)) throw new Error('Cuestionario no válido: revisa preguntas, respuestas, tiempos y puntos.');
  return { id: uid(), title: data.title, questions: data.questions.map(q => ({
    text: q.text, time: q.time, points: q.points, type: questionType(q),
    explanation: q.explanation || '', accepted: q.accepted || [], media: q.media || null,
    answers: q.answers.map(a => ({ text: a.text, correct: a.correct, ...(a.media ? { media: a.media } : {}) })),
  })) };
}
function importFile(text) {
  if (new TextEncoder().encode(text).length > MAX_LIBRARY_BYTES) throw new Error('El archivo supera el límite de 20 MB para bibliotecas.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('El archivo no contiene JSON válido.'); }
  const incoming = Array.isArray(data) || data?.version !== undefined
    ? parseLibrary(text).map(q => ({ ...q, id: uid() })) : [importQuizJson(text)];
  saveQuizzes([...getQuizzes(), ...incoming]);
}
function exportQuiz(quiz) {
  const clean = normalizeQuiz(quiz);
  delete clean.id;
  const filename = (quiz.title.trim() || 'cuestionario').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^\w\- ]+/g, '').replace(/ +/g, '-').toLowerCase() || 'cuestionario';
  download(JSON.stringify(clean, null, 2), filename + '.quizlab.json');
}

export { sampleQuiz, getQuizzes, saveQuizzes, getQuiz, upsertQuiz, deleteQuiz, blankQuestion, newQuiz, validateQuiz, normalizeQuiz, importQuizJson, importFile, exportQuiz };
