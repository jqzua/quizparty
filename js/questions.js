export const QUESTION_TYPES = Object.freeze({
  single: 'Elección única', multi: 'Selección múltiple', boolean: 'Verdadero / falso',
  order: 'Ordenar', written: 'Respuesta escrita', poll: 'Encuesta',
});
export const questionType = q => q.type || 'single';
export const normalizeWritten = value => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
export function validResponse(q, response) {
  const type = questionType(q);
  if (type === 'written') return typeof response === 'string' && response.length <= 160 && !!response.trim();
  const index = n => Number.isInteger(n) && n >= 0 && n < q.answers.length;
  if (type === 'multi' || type === 'order') return Array.isArray(response) &&
    response.length >= 1 && response.length <= q.answers.length && response.every(index) &&
    new Set(response).size === response.length && (type !== 'order' || response.length === q.answers.length);
  return index(response);
}
export function isCorrect(q, response) {
  if (!validResponse(q, response)) return false;
  const type = questionType(q);
  if (type === 'poll') return null;
  if (type === 'written') return (q.accepted || []).some(a => normalizeWritten(a) === normalizeWritten(response));
  if (type === 'order') return response.every((value, i) => value === i);
  if (type === 'multi') {
    const correct = q.answers.flatMap((a, i) => a.correct ? [i] : []);
    return correct.length === response.length && correct.every(i => response.includes(i));
  }
  return q.answers[response].correct;
}
export function solutionText(q) {
  const type = questionType(q);
  if (type === 'poll') return 'Encuesta: no hay respuestas correctas ni puntos.';
  if (type === 'written') return (q.accepted || []).join(' / ');
  if (type === 'order') return q.answers.map((a, i) => `${i + 1}. ${a.text}`).join(' → ');
  return q.answers.filter(a => a.correct).map(a => a.text).join(' · ');
}
export function responseText(q, response) {
  if (response === null) return 'Sin respuesta';
  if (questionType(q) === 'written') return response;
  return (Array.isArray(response) ? response : [response]).map(i => q.answers[i]?.text || '').join(questionType(q) === 'order' ? ' → ' : ' · ');
}
export function shuffledIndices(length) {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
