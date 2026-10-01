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
  edQuiz.questions.forEach(q => { while (q.answers.length < 2) q.answers.push({ text: '', correct: false }); });
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

function edRenderQuestion() {
  const q = edQuiz.questions[edIndex];
  if (!q) return;
  $('#ed-qlabel').textContent = `Pregunta ${edIndex + 1} de ${edQuiz.questions.length}`;
  $('#ed-qtext').value = q.text;
  $('#ed-qtime').value = String(q.time);
  $('#ed-qpoints').value = q.points;
  $('#ed-answers').innerHTML = q.answers.map((a, i) => `
    <div class="ans-row" data-i="${i}">
      <div class="ans-swatch c${i}">${SHAPES[i]}</div>
      <input aria-label="Respuesta ${i + 1}" type="text" maxlength="100" placeholder="Respuesta ${i + 1}${i >= 2 ? ' (opcional)' : ''}" value="${esc(a.text)}">
      <input aria-label="Marcar la respuesta ${i + 1} como correcta" type="checkbox" title="Respuesta correcta" ${a.correct ? 'checked' : ''}>
      ${q.answers.length > 2 ? '<button class="btn sm" data-act="rm" aria-label="Eliminar respuesta" title="Eliminar">✕</button>' : ''}
    </div>`).join('');
  $('#ed-adda').style.display = q.answers.length < 4 ? '' : 'none';
}

export function initEditorEvents() {
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
    if (e.target.type === 'checkbox') a.correct = e.target.checked;
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
