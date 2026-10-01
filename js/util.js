'use strict';

export const SHAPES = ['▲', '◆', '●', '■'];

export const $ = sel => document.querySelector(sel);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function uid() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
}

export function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  window.scrollTo(0, 0);
  focusView(id);
}

export function showSub(root, id) {
  document.querySelectorAll(`#${root} > div`).forEach(v => v.classList.toggle('active', v.id === id));
  window.scrollTo(0, 0);
  focusView(id);
}

export function ordinal(n) {
  return `${n}.º`;
}

export function joinUrl(pin) {
  return location.origin + location.pathname + '#join/' + pin;
}

function focusView(id) {
  const root = document.getElementById(id);
  const target = root.querySelector('h1, h2, .p-qtext, input, button') || root;
  if (!target.matches('input, button')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}
export function download(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
