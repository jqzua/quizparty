import { questionType } from './questions.js';
import { MEDIA_ACCEPT, mediaHTML, readMedia, quizMediaBytes, MAX_QUIZ_MEDIA } from './media.js';
import { $, SHAPES, esc, showView } from './util.js';
import { getQuiz, upsertQuiz, blankQuestion, exportQuiz } from './store.js';
import { MAX_QUESTIONS } from './config.js';
'use strict';

/* Quiz editor. Edits `edQuiz` in place and auto-saves to localStorage on every change. */
let edQuiz = null;
let edIndex = 0;

export function renderEditor(quizId) {
  edQuiz = getQuiz(quizId);
  if (!edQuiz) { location.hash = 'library'; return; }
  edQuiz.questions.forEach(q => { while (questionType(q) !== 'written' && q.answers.length < 2) q.answers.push({ text: '', correct: false }); });
  edIndex = 0;
  showView('view-editor');
  $('#ed-title').value = edQuiz.title;
  edRenderTabs();
  edRenderQuestion();
}

function edSave() {
  if (edQuiz) upsertQuiz(edQuiz);
}

function edRenderTabs() {
  const restoreFocus = document.activeElement?.matches('.q-tab');
  $('#ed-addq').disabled = edQuiz.questions.length >= MAX_QUESTIONS;
  $('#ed-qdup').disabled = edQuiz.questions.length >= MAX_QUESTIONS;
  $('#ed-qlist').innerHTML = edQuiz.questions.map((q, i) => `
    <button class="q-tab ${i === edIndex ? 'sel' : ''}" data-i="${i}" aria-pressed="${i === edIndex}">
      <small>${i + 1}</small>${esc(q.text.trim() || 'Pregunta sin título')}
    </button>`).join('');
  if (restoreFocus) $(`#ed-qlist [data-i="${edIndex}"]`)?.focus();
}

const TYPE_HINTS = {
  single: 'Se elige una opción. Cualquiera de las opciones marcadas como correctas da puntos por rapidez.',
  multi: 'Hay que seleccionar todas las respuestas correctas y ninguna incorrecta. Sin puntuación parcial.',
  boolean: 'Marca exactamente una respuesta correcta. Puntos por rapidez.',
  order: 'Introduce las opciones en el orden correcto (de arriba abajo). Se mezclarán al jugar. Solo el orden completo correcto da puntos.',
  written: 'Se compara con las variantes aceptadas: se ignoran mayúsculas y espacios repetidos, pero las tildes cuentan. Puntos por rapidez.',
  poll: 'Cada participante elige una opción. Sin aciertos, sin puntos y sin cambios de racha.',
};
function mediaEditor(media, target) {
  return `<details class="media-editor"><summary>${media ? 'Editar multimedia' : 'Añadir imagen, audio o vídeo'}</summary>
    <label>Archivo (imagen hasta 1 MB; audio/vídeo hasta 2 MB)<input type="file" data-media-file="${target}" accept="${MEDIA_ACCEPT}"></label>
    ${media ? `${mediaHTML(media)}<label>Alternativa textual / transcripción (obligatoria)<textarea maxlength="2000" data-media-alt="${target}">${esc(media.alt)}</textarea></label><button class="btn" data-media-remove="${target}">Quitar multimedia</button>` : ''}
    <small>Hasta 4 MB de multimedia por cuestionario. Los archivos se incluyen en las copias exportadas.</small></details>`;
}
function edRenderQuestion() {
  const q = edQuiz.questions[edIndex];
  if (!q) return;
  const type = questionType(q);
  $('#ed-qlabel').textContent = `Pregunta ${edIndex + 1} de ${edQuiz.questions.length}`;
  $('#ed-qtext').value = q.text;
  $('#ed-qtime').value = String(q.time);
  $('#ed-qpoints').value = type === 'poll' ? 'none' : q.points;
  $('#ed-qpoints').disabled = type === 'poll';
  $('#ed-type').value = type;
  $('#ed-explanation').value = q.explanation || '';
  $('#ed-type-hint').textContent = TYPE_HINTS[type];
  $('#ed-written').hidden = type !== 'written';
  $('#ed-accepted').value = (q.accepted || []).join('\n');
  $('#ed-media').innerHTML = mediaEditor(q.media, 'question');
  $('#ed-media-error').textContent = '';
  $('#ed-answers').innerHTML = type === 'written' ? '' : q.answers.map((a, i) => `
    <div class="answer-editor"><div class="ans-row" data-i="${i}">
      <div class="ans-swatch c${i}">${type === 'order' ? i + 1 : SHAPES[i]}</div>
      <input aria-label="Respuesta ${i + 1}" type="text" maxlength="100" placeholder="Respuesta ${i + 1}" value="${esc(a.text)}" ${type === 'boolean' ? 'readonly' : ''}>
      ${['single', 'multi', 'boolean'].includes(type) ? `<input aria-label="Marcar la respuesta ${i + 1} como correcta" type="checkbox" ${a.correct ? 'checked' : ''}>` : ''}
      ${q.answers.length > 2 && type !== 'boolean' ? '<button class="btn sm" data-act="rm" aria-label="Eliminar respuesta">✕</button>' : ''}
    </div>${mediaEditor(a.media, String(i))}</div>`).join('');
  $('#ed-adda').hidden = ['written', 'boolean'].includes(type) || q.answers.length >= 4;
}

export function initEditorEvents() {
  $('#ed-type').addEventListener('change', e => {
    const q = edQuiz.questions[edIndex]; q.type = e.target.value;
    if (q.type === 'boolean') q.answers = [{ text: 'Verdadero', correct: true }, { text: 'Falso', correct: false }];
    if (q.type === 'written') q.answers = [];
    if (q.type === 'poll') { q.points = 'none'; q.answers.forEach(a => { a.correct = false; }); }
    if (q.type !== 'written') while (q.answers.length < 2) q.answers.push({ text: '', correct: false });
    edSave(); edRenderQuestion();
  });
  $('#ed-accepted').addEventListener('change', e => {
    edQuiz.questions[edIndex].accepted = e.target.value.split('\n').map(a => a.trim().slice(0, 160)).filter(Boolean).slice(0, 10);
    e.target.value = edQuiz.questions[edIndex].accepted.join('\n'); edSave();
  });
  $('#ed-explanation').addEventListener('input', e => { edQuiz.questions[edIndex].explanation = e.target.value; edSave(); });
  $('#ed-qmain').addEventListener('change', async e => {
    const target = e.target.dataset.mediaFile;
    if (target === undefined || !e.target.files?.[0]) return;
    const q = edQuiz.questions[edIndex], quiz = edQuiz;
    const owner = target === 'question' ? q : q.answers[+target];
    try {
      const media = await readMedia(e.target.files[0]);
      if (quiz !== edQuiz || !quiz.questions.includes(q) || (owner !== q && !q.answers.includes(owner))) return;
      const previous = owner.media; owner.media = media;
      if (quizMediaBytes(quiz) > MAX_QUIZ_MEDIA) { owner.media = previous; throw new Error('El cuestionario supera los 4 MB de multimedia.'); }
      edSave(); edRenderQuestion();
    } catch (error) { $('#ed-media-error').textContent = error.message; }
  });
  $('#ed-qmain').addEventListener('input', e => {
    const target = e.target.dataset.mediaAlt; if (target === undefined) return;
    const q = edQuiz.questions[edIndex], owner = target === 'question' ? q : q.answers[+target];
    if (owner.media) { owner.media.alt = e.target.value; edSave(); }
  });
  $('#ed-qmain').addEventListener('click', e => {
    const button = e.target.closest('[data-media-remove]'); if (!button) return;
    const target = button.dataset.mediaRemove, q = edQuiz.questions[edIndex];
    const owner = target === 'question' ? q : q.answers[+target];
    delete owner.media; edSave(); edRenderQuestion();
  });
  $('#ed-title').addEventListener('input', e => {
    if (!edQuiz) return;
    edQuiz.title = e.target.value;
    edSave();
  });

  $('#ed-qlist').addEventListener('click', e => {
    const tab = e.target.closest('.q-tab');
    if (!tab) return;
    edIndex = +tab.dataset.i;
    edRenderTabs();
    edRenderQuestion();
  });

  $('#ed-addq').addEventListener('click', () => {
    if (edQuiz.questions.length >= MAX_QUESTIONS) return;
    edQuiz.questions.push(blankQuestion());
    edIndex = edQuiz.questions.length - 1;
    edSave(); edRenderTabs(); edRenderQuestion();
  });

  $('#ed-qtext').addEventListener('input', e => {
    edQuiz.questions[edIndex].text = e.target.value;
    edSave(); edRenderTabs();
  });
  $('#ed-qtime').addEventListener('change', e => {
    edQuiz.questions[edIndex].time = +e.target.value;
    edSave();
  });
  $('#ed-qpoints').addEventListener('change', e => {
    edQuiz.questions[edIndex].points = e.target.value;
    edSave();
  });

  $('#ed-answers').addEventListener('input', e => {
    const row = e.target.closest('.ans-row');
    if (!row) return;
    const a = edQuiz.questions[edIndex].answers[+row.dataset.i];
    if (e.target.type === 'text') a.text = e.target.value;
    if (e.target.type === 'checkbox') {
      if (questionType(edQuiz.questions[edIndex]) === 'boolean') edQuiz.questions[edIndex].answers.forEach(item => { item.correct = false; });
      a.correct = e.target.checked;
      if (questionType(edQuiz.questions[edIndex]) === 'boolean') $('#ed-answers').querySelectorAll('input[type=checkbox]').forEach((box, i) => { box.checked = edQuiz.questions[edIndex].answers[i].correct; });
    }
    edSave();
  });
  $('#ed-answers').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act="rm"]');
    if (!btn) return;
    const row = btn.closest('.ans-row');
    edQuiz.questions[edIndex].answers.splice(+row.dataset.i, 1);
    edSave(); edRenderQuestion();
    $('#ed-answers input[type=text]')?.focus();
  });
  $('#ed-adda').addEventListener('click', () => {
    const q = edQuiz.questions[edIndex];
    if (q.answers.length < 4) q.answers.push({ text: '', correct: false });
    edSave(); edRenderQuestion();
  });

  $('#ed-qup').addEventListener('click', () => edMoveQuestion(-1));
  $('#ed-qdown').addEventListener('click', () => edMoveQuestion(1));
  $('#ed-qdup').addEventListener('click', () => {
    if (edQuiz.questions.length >= MAX_QUESTIONS) return;
    const copy = JSON.parse(JSON.stringify(edQuiz.questions[edIndex]));
    edQuiz.questions.splice(edIndex + 1, 0, copy);
    if (quizMediaBytes(edQuiz) > MAX_QUIZ_MEDIA) {
      edQuiz.questions.splice(edIndex + 1, 1);
      $('#ed-media-error').textContent = 'No se puede duplicar: el cuestionario superaría los 4 MB de multimedia.';
      return;
    }
    edIndex++;
    edSave(); edRenderTabs(); edRenderQuestion();
  });
  $('#ed-qdel').addEventListener('click', () => {
    if (edQuiz.questions.length === 1) {
      edQuiz.questions[0] = blankQuestion();
    } else {
      edQuiz.questions.splice(edIndex, 1);
      edIndex = Math.min(edIndex, edQuiz.questions.length - 1);
    }
    edSave(); edRenderTabs(); edRenderQuestion();
  });

  $('#ed-export').addEventListener('click', () => exportQuiz(edQuiz));
  $('#ed-host').addEventListener('click', () => { location.hash = 'host/' + edQuiz.id; });
}

function edMoveQuestion(dir) {
  const to = edIndex + dir;
  if (to < 0 || to >= edQuiz.questions.length) return;
  const [q] = edQuiz.questions.splice(edIndex, 1);
  edQuiz.questions.splice(to, 0, q);
  edIndex = to;
  edSave(); edRenderTabs(); edRenderQuestion();
}
