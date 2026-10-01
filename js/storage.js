import { parseLibrary, validateStoredQuiz } from './schema.js';
export const LS_KEY = 'quizparty.quizzes.v1';
export function createLibrary({ storage, seed, notify = () => {} }) {
  let cache = null, blocked = false, raw = null, dirty = false;
  function report(message) { notify({ message, blocked, dirty, hasRaw: raw !== null }); }
  function get() {
    if (cache !== null) return structuredClone(cache);
    try { raw = storage().getItem(LS_KEY); }
    catch {
      blocked = true; cache = [];
      report('No se puede leer el almacenamiento. Puedes trabajar temporalmente y descargar una copia antes de salir.');
      return [];
    }
    if (raw !== null) {
      try { cache = parseLibrary(raw); }
      catch {
        blocked = true; cache = [];
        report('La biblioteca no se puede leer. El original se conserva: descarga el archivo original para recuperarlo. Los cambios serán temporales.');
      }
    } else { cache = seed(); save(cache); }
    return structuredClone(cache);
  }
  function save(quizzes) {
    if (cache === null) get();
    if (!Array.isArray(quizzes) || (!quizzes.every(validateStoredQuiz) || new Set(quizzes.map(q => q.id)).size !== quizzes.length)) throw new Error('La biblioteca contiene datos no válidos.');
    cache = structuredClone(quizzes);
    dirty = true;
    if (blocked) { report('Cambios temporales: el almacenamiento no está disponible o contiene una biblioteca no válida. Descarga una copia antes de salir.'); return false; }
    try {
      // Do not silently overwrite edits made by another tab.
      if (storage().getItem(LS_KEY) !== raw) {
        blocked = true;
        report('Otra pestaña ha cambiado la biblioteca. Descarga tus cambios y recarga para recuperar la versión guardada.');
        return false;
      }
      const next = JSON.stringify({ version: 2, quizzes: cache });
      storage().setItem(LS_KEY, next);
      raw = next; dirty = false; report(''); return true;
    } catch {
      report('No se han guardado los cambios (almacenamiento bloqueado o sin espacio). Descarga una copia antes de salir.');
      return false;
    }
  }
  return { get, save, original: () => raw, backup: () => JSON.stringify({ version: 2, quizzes: get() }, null, 2), isDirty: () => dirty };
}
