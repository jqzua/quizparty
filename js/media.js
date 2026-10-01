import { esc } from './util.js';
export const MEDIA_TYPES = Object.freeze({
  'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image', 'image/gif': 'image',
  'audio/mpeg': 'audio', 'audio/ogg': 'audio', 'audio/wav': 'audio',
  'video/mp4': 'video', 'video/webm': 'video',
});
export const MEDIA_ACCEPT = Object.keys(MEDIA_TYPES).join(',');
export const MAX_QUIZ_MEDIA = 4 * 1024 * 1024;
export function mediaBytes(media) {
  if (!media?.src) return 0;
  const value = media.src.slice(media.src.indexOf(',') + 1);
  return value.length * 3 / 4 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
}
export function validMedia(media) {
  if (media === null || media === undefined) return true;
  if (typeof media !== 'object' || typeof media.src !== 'string' || typeof media.alt !== 'string' || media.alt.length > 2000) return false;
  if (media.src.length > 3 * 1024 * 1024) return false;
  const match = /^data:([a-z]+\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(media.src);
  if (!match || !MEDIA_TYPES[match[1]] || MEDIA_TYPES[match[1]] !== media.kind || match[2].length % 4 !== 0) return false;
  const bytes = mediaBytes(media);
  return bytes > 0 && bytes <= (media.kind === 'image' ? 1 : 2) * 1024 * 1024;
}
export function quizMediaBytes(quiz) {
  return quiz.questions.reduce((sum, q) => sum + mediaBytes(q.media) + q.answers.reduce((n, a) => n + mediaBytes(a.media), 0), 0);
}
export async function readMedia(file) {
  const kind = MEDIA_TYPES[file.type];
  if (!kind) throw new Error('Formato no admitido. Usa PNG, JPEG, WebP, GIF, MP3, OGG, WAV, MP4 o WebM.');
  const limit = (kind === 'image' ? 1 : 2) * 1024 * 1024;
  if (file.size === 0 || file.size > limit) throw new Error(`El archivo debe ocupar entre 1 byte y ${limit / 1024 / 1024} MB.`);
  const src = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se ha podido leer el archivo.'));
    reader.readAsDataURL(file);
  });
  return { kind, src, alt: '' };
}
export function mediaHTML(media) {
  if (!media || !validMedia(media)) return '';
  const alt = esc(media.alt);
  const source = esc(media.src);
  if (media.kind === 'image') return `<figure class="question-media"><img src="${source}" alt="${alt}" loading="lazy"></figure>`;
  const tag = media.kind === 'video' ? 'video' : 'audio';
  return `<figure class="question-media"><${tag} controls preload="metadata" ${tag === 'video' ? 'playsinline' : ''} src="${source}" aria-label="${alt || 'Contenido multimedia'}"></${tag}><details><summary>Alternativa textual / transcripción</summary><p>${alt}</p></details></figure>`;
}
export function stopMedia(root = document) { root.querySelectorAll('audio, video').forEach(element => element.pause()); }
