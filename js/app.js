import { $, esc, showView, download } from './util.js';
import { cleanupRoute, parseRoute, permitNavigation } from './navigation.js';
import { getQuizzes, newQuiz, upsertQuiz, importFile, exportQuiz, getQuiz, deleteQuiz, library } from './store.js';
import { renderEditor, initEditorEvents } from './editor.js';
import { startHost } from './host.js';
import { playerShowJoinForm, initPlayerEvents } from './player.js';
import { MAX_LIBRARY_BYTES } from './config.js';
'use strict';

let currentHash = '';
function route() {
  if (!permitNavigation()) {
    history.replaceState(null, '', location.pathname + location.search + currentHash);
    return;
  }
  cleanupRoute();
  const target = parseRoute(location.hash);
  currentHash = location.hash;
  if (target.view === 'library') renderLibrary();
  else if (target.view === 'editor') renderEditor(target.id);
  else if (target.view === 'host') startHost(target.id);
  else if (target.view === 'join') renderJoin(target.pin);
  else {
    currentHash = '';
    history.replaceState(null, '', location.pathname + location.search);
    renderHome();
  }
}

function renderHome() {
  showView('view-home');
  $('#home-pin').value = '';
}

function renderLibrary() {
  showView('view-library');
  const list = $('#lib-list');
  const quizzes = getQuizzes();
  if (!quizzes.length) {
    list.innerHTML = '<p class="empty-note">Todavía no hay cuestionarios. ¡Crea uno!</p>';
    return;
  }
  list.innerHTML = quizzes.map(q => `
    <div class="quiz-item" data-id="${esc(q.id)}">
      <div class="qi-info">
        <b>${esc(q.title.trim() || 'Cuestionario sin título')}</b>
        <small>${q.questions.length} pregunta${q.questions.length === 1 ? '' : 's'}</small>
      </div>
      <button class="btn primary" data-act="host">Organizar ▶</button>
      <button class="btn" data-act="edit">Editar</button>
      <button class="btn" data-act="export">Exportar</button>
      <button class="btn danger" data-act="del">Eliminar</button>
    </div>`).join('');
}

function renderJoin(pin) {
  showView('view-play');
  playerShowJoinForm(pin);
}

function init() {
  document.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => { location.hash = button.dataset.route; }));
  document.querySelectorAll('[data-reload]').forEach(button => button.addEventListener('click', () => location.reload()));
  document.addEventListener('storage-status', e => {
    $('#storage-warning').hidden = !e.detail.message;
    $('#storage-message').textContent = e.detail.message;
    $('#storage-original').hidden = !e.detail.hasRaw;
  });
  $('#storage-backup').addEventListener('click', () => download(library.backup(), 'quizlab-biblioteca.json'));
  $('#lib-backup').addEventListener('click', () => download(library.backup(), 'quizlab-biblioteca.json'));
  $('#storage-original').addEventListener('click', () => download(library.original() || '', 'quizlab-original.json'));
  window.addEventListener('beforeunload', e => {
    if (library.isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });
  /* Home */
  const goJoin = () => {
    const pin = $('#home-pin').value.replace(/\D/g, '');
    location.hash = 'join' + (pin ? '/' + pin : '');
  };
  $('#home-join').addEventListener('click', goJoin);
  $('#home-pin').addEventListener('keydown', e => { if (e.key === 'Enter') goJoin(); });
  $('#home-host').addEventListener('click', () => { location.hash = 'library'; });

  /* Library */
  $('#lib-new').addEventListener('click', () => {
    const quiz = newQuiz();
    upsertQuiz(quiz);
    location.hash = 'editor/' + quiz.id;
  });
  $('#lib-import').addEventListener('click', () => $('#lib-file').click());
  $('#lib-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_LIBRARY_BYTES) throw new Error('El archivo supera el límite de 20 MB para bibliotecas.');
      importFile(await file.text());
      renderLibrary();
    } catch (err) {
      alert('No se ha podido importar: ' + err.message);
    }
  });
  $('#lib-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.quiz-item').dataset.id;
    const act = btn.dataset.act;
    if (act === 'host') location.hash = 'host/' + id;
    else if (act === 'edit') location.hash = 'editor/' + id;
    else if (act === 'export') exportQuiz(getQuiz(id));
    else if (act === 'del') {
      const quiz = getQuiz(id);
      if (confirm(`¿Eliminar "${quiz.title.trim() || 'Cuestionario sin título'}"?`)) {
        deleteQuiz(id);
        renderLibrary();
      }
    }
  });

  initEditorEvents();
  initPlayerEvents();

  window.addEventListener('hashchange', route);
  route();
}

init();
