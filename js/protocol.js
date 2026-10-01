import { MAX_QUESTIONS } from './config.js';
import { QUESTION_TYPES } from './questions.js';
import { validMedia, mediaBytes, MAX_QUIZ_MEDIA } from './media.js';
const str = (v, max) => typeof v === 'string' && v.length <= max;
const integer = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= min && v <= max;
const token = v => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
export function secret() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join(''); }
export function validClientMessage(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  if (d.t === 'join') return str(d.name, 20) && !!d.name.trim() &&
    (d.session === undefined || (token(d.session?.id) && token(d.session?.token)));
  if (d.t === 'a') return integer(d.i, 0, MAX_QUESTIONS - 1) &&
    (integer(d.c, 0, 3) || str(d.c, 160) || (Array.isArray(d.c) && d.c.length >= 1 && d.c.length <= 4 && d.c.every(n => integer(n, 0, 3)) && new Set(d.c).size === d.c.length));
  if (d.t === 'ping') return integer(d.seq);
  return false;
}
export function validHostMessage(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  switch (d.t) {
    case 'welcome': return str(d.name, 30) && token(d.session?.id) && token(d.session?.token) && typeof d.inGame === 'boolean';
    case 'lobby': return true;
    case 'approval':
    case 'wait': return str(d.message, 250);
    case 'ack': return integer(d.i, 0, MAX_QUESTIONS - 1);
    case 'pong': return integer(d.seq);
    case 'kick': return str(d.reason, 250);
    case 'q': return integer(d.i, 0, MAX_QUESTIONS - 1) && integer(d.n, 1, MAX_QUESTIONS) && d.i < d.n &&
      str(d.text, 200) && Object.hasOwn(QUESTION_TYPES, d.type) && Array.isArray(d.answers) &&
      (d.type === 'written' ? d.answers.length === 0 : d.answers.length >= 2 && d.answers.length <= 4) &&
      d.answers.every(a => str(a, 100)) && Number.isFinite(d.secs) && d.secs >= 0 && d.secs <= 90 && typeof d.answered === 'boolean' &&
      validMedia(d.media) && Array.isArray(d.answerMedia) && d.answerMedia.length === d.answers.length && d.answerMedia.every(validMedia) &&
      mediaBytes(d.media) + d.answerMedia.reduce((sum, m) => sum + mediaBytes(m), 0) <= MAX_QUIZ_MEDIA;
    case 'reveal': return typeof d.gotIt === 'boolean' && typeof d.answered === 'boolean' &&
      integer(d.points) && integer(d.score) && integer(d.streak) && integer(d.rank, 1) && integer(d.total, d.rank) &&
      typeof d.survey === 'boolean' && str(d.explanation, 1000) && str(d.solution, 2000);
    case 'end': return integer(d.score) && integer(d.rank, 1) && integer(d.total, d.rank);
    default: return false;
  }
}
export function send(conn, data) {
  if (!conn?.open) return false;
  try { conn.send(data); return true; } catch { return false; }
}
