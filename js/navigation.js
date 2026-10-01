let cleanup = null;
let canLeave = () => true;
export function setCleanup(fn) { cleanup = fn; }
export function setLeaveGuard(fn = () => true) { canLeave = fn; }
export function permitNavigation() { return canLeave(); }
export function cleanupRoute() {
  const fn = cleanup;
  cleanup = null;
  canLeave = () => true;
  if (fn) fn();
}
export function parseRoute(hash) {
  let value;
  try { value = decodeURIComponent(hash.replace(/^#/, '')); } catch { return { view: 'home' }; }
  if (value === 'library') return { view: 'library' };
  const match = /^(editor|host)\/([a-zA-Z0-9-]{1,100})$/.exec(value);
  if (match) return { view: match[1], id: match[2] };
  const join = /^join(?:\/(\d{6}))?$/.exec(value);
  return join ? { view: 'join', pin: join[1] || '' } : { view: 'home' };
}
