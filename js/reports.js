import { $, esc, showView, download, uid } from './util.js';
import { questionType, responseText, solutionText, QUESTION_TYPES } from './questions.js';
const KEY = 'quizlab.reports.v1';
const MAX_REPORTS = 50;
const MAX_HISTORY_BYTES = 4 * 1024 * 1024;
export function newReport(quiz) {
  return { id: uid(), version: 1, title: quiz.title, startedAt: new Date().toISOString(), endedAt: null, complete: false, questions: [], participants: [] };
}
export function recordQuestion(report, q, index, players) {
  if (report.questions.some(item => item.index === index)) return;
  const rows = players.map(p => ({
    id: p.id, name: p.name, response: responseText(q, p.choice), answered: p.choice !== null,
    correct: questionType(q) === 'poll' ? null : !!p.lastGotIt,
    points: p.lastPts, elapsedMs: p.choice === null ? null : Math.round(p.answerMs),
  }));
  report.questions.push({ index, text: q.text, type: questionType(q), explanation: q.explanation || '', solution: solutionText(q), rows });
  report.endedAt = new Date().toISOString();
  report.participants = summarizeParticipants(report);
}
export function summarizeParticipants(report) {
  const people = new Map();
  for (const q of report.questions) for (const row of q.rows) {
    const p = people.get(row.id) || { id: row.id, name: row.name, score: 0, answered: 0, total: 0, correct: 0, graded: 0 };
    p.score += row.points; p.total++; if (row.answered) p.answered++;
    if (row.correct !== null) { p.graded++; if (row.correct) p.correct++; }
    people.set(row.id, p);
  }
  return [...people.values()].sort((a, b) => b.score - a.score);
}
export function questionStats(q) {
  const graded = q.rows.filter(r => r.correct !== null);
  return { total: q.rows.length, answered: q.rows.filter(r => r.answered).length,
    correct: graded.filter(r => r.correct).length, graded: graded.length };
}
const rate = (correct, total) => total ? `${Math.round(correct / total * 100)} %` : 'No evaluable';
function validReport(r) {
  return r && typeof r.id === 'string' && r.version === 1 && typeof r.title === 'string' &&
    typeof r.startedAt === 'string' && Array.isArray(r.questions) && r.questions.length <= 200 && r.questions.every(q =>
      q && Number.isInteger(q.index) && typeof q.text === 'string' && Object.hasOwn(QUESTION_TYPES, q.type) &&
      typeof q.explanation === 'string' && typeof q.solution === 'string' && Array.isArray(q.rows) && q.rows.length <= 50 && q.rows.every(row =>
        row && typeof row.id === 'string' && typeof row.name === 'string' && typeof row.response === 'string' &&
        typeof row.answered === 'boolean' && (row.correct === null || typeof row.correct === 'boolean') &&
        Number.isFinite(row.points) && row.points >= 0 && (row.elapsedMs === null || Number.isFinite(row.elapsedMs))));
}
export function readReports(storage = globalThis.localStorage) {
  const raw = storage.getItem(KEY);
  if (raw === null) return [];
  if (raw.length > MAX_HISTORY_BYTES) throw new Error('El historial supera el tamaño permitido.');
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.reports) || data.reports.length > MAX_REPORTS || !data.reports.every(validReport)) throw new Error('El historial no es válido. Se conserva el original.');
  return data.reports;
}
export function saveReport(report, storage = globalThis.localStorage) {
  try {
    const reports = readReports(storage).filter(r => r.id !== report.id);
    reports.unshift(structuredClone(report));
    if (reports.length > MAX_REPORTS) return 'Historial lleno (50 partidas). Exporta y elimina partidas antiguas para guardar esta.';
    const raw = JSON.stringify({ version: 1, reports });
    if (new TextEncoder().encode(raw).length > MAX_HISTORY_BYTES) return 'El historial ocupa demasiado espacio. Exporta y elimina partidas antiguas.';
    storage.setItem(KEY, raw);
    return '';
  } catch { return 'No se ha guardado el informe local. Descarga el CSV antes de salir; el historial anterior se conserva.'; }
}
// Quote every cell and neutralize spreadsheet formulas, including after whitespace.
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function reportCSV(report) {
  const rows = [['Cuestionario', 'Fecha', 'Pregunta', 'Tipo', 'Participante', 'Respuesta', 'Respondida', 'Correcta', 'Puntos', 'Tiempo (ms)', 'Solución', 'Explicación']];
  for (const q of report.questions) for (const row of q.rows) rows.push([
    report.title, report.startedAt, q.index + 1, QUESTION_TYPES[q.type], row.name, row.response,
    row.answered ? 'Sí' : 'No', row.correct === null ? 'No evaluable' : row.correct ? 'Sí' : 'No',
    row.points, row.elapsedMs, q.solution, q.explanation,
  ]);
  rows.push([], ['Resumen por participante'], ['Participante', 'Puntos', 'Respondidas', 'Preguntas recibidas', 'Aciertos', 'Evaluables', 'Tasa de acierto']);
  for (const p of summarizeParticipants(report)) rows.push([p.name, p.score, p.answered, p.total, p.correct, p.graded, rate(p.correct, p.graded)]);
  rows.push([], ['Resumen por pregunta'], ['Pregunta', 'Enunciado', 'Respuestas', 'Participantes', 'Aciertos', 'Evaluables', 'Tasa de acierto']);
  for (const q of report.questions) { const s = questionStats(q); rows.push([q.index + 1, q.text, s.answered, s.total, s.correct, s.graded, rate(s.correct, s.graded)]); }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
export function exportReport(report) { download(reportCSV(report), `quizlab-resultados-${report.startedAt.slice(0, 10)}.csv`, 'text/csv;charset=utf-8'); }
export function reportHTML(report) {
  return `<h2>${esc(report.title)}</h2><p>${esc(new Date(report.startedAt).toLocaleString('es-ES'))} · ${report.complete ? 'Finalizada' : 'Parcial'}</p>
    <h3>Participantes</h3><div class="table-scroll"><table><caption>Resultados por participante</caption><thead><tr><th>Participante</th><th>Puntos</th><th>Respondidas</th><th>Aciertos</th></tr></thead><tbody>${summarizeParticipants(report).map(p => `<tr><th scope="row">${esc(p.name)}</th><td>${p.score}</td><td>${p.answered}/${p.total}</td><td>${rate(p.correct, p.graded)} (${p.correct}/${p.graded})</td></tr>`).join('')}</tbody></table></div>
    <h3>Preguntas</h3>${report.questions.map(q => { const s = questionStats(q); return `<details><summary>${q.index + 1}. ${esc(q.text)} · ${s.answered}/${s.total} respuestas · ${rate(s.correct, s.graded)}</summary><p>Solución: ${esc(q.solution)}</p><p>${esc(q.explanation)}</p><div class="table-scroll"><table><thead><tr><th>Participante</th><th>Respuesta</th><th>Resultado</th><th>Puntos</th></tr></thead><tbody>${q.rows.map(r => `<tr><th scope="row">${esc(r.name)}</th><td>${esc(r.response)}</td><td>${r.correct === null ? 'Encuesta' : r.correct ? 'Correcta' : 'Incorrecta'}</td><td>${r.points}</td></tr>`).join('')}</tbody></table></div></details>`; }).join('')}`;
}
export function renderReports() {
  showView('view-reports');
  try {
    const reports = readReports();
    $('#reports-list').innerHTML = reports.length ? reports.map(r => `<article class="card report" data-report="${esc(r.id)}">${reportHTML(r)}<button class="btn" data-csv>Descargar CSV</button> <button class="btn danger" data-delete>Eliminar informe</button></article>`).join('') : '<p>No hay partidas guardadas.</p>';
    $('#reports-status').textContent = 'El historial se guarda solo en este navegador. Los CSV contienen los apodos y respuestas de los participantes.';
  } catch { $('#reports-list').textContent = ''; $('#reports-status').textContent = 'No se puede leer el historial. Se conserva el original; puedes descargarlo para recuperarlo.'; }
}
export function initReportEvents() {
  $('#reports-list').addEventListener('click', e => {
    const button = e.target.closest('[data-csv], [data-delete]'); if (!button) return;
    try {
      const reports = readReports(), id = button.closest('[data-report]').dataset.report;
      const report = reports.find(r => r.id === id); if (!report) return;
      if (button.hasAttribute('data-csv')) exportReport(report);
      else if (confirm('¿Eliminar este informe del navegador?')) {
        localStorage.setItem(KEY, JSON.stringify({ version: 1, reports: reports.filter(r => r.id !== id) })); renderReports();
      }
    } catch { $('#reports-status').textContent = 'No se ha podido acceder al historial.'; }
  });
  $('#reports-backup').addEventListener('click', () => {
    try { download(localStorage.getItem(KEY) || '{"version":1,"reports":[]}', 'quizlab-historial.json'); }
    catch { $('#reports-status').textContent = 'No se ha podido leer el historial.'; }
  });
}
