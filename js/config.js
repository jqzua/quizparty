// Public settings only: never put long-lived TURN credentials in a static site.
export const PEER_PREFIX = 'quizlab-v3-';
export const NETWORK = Object.freeze({
  host: '0.peerjs.com', port: 443, path: '/', secure: true, debug: 1,
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], iceTransportPolicy: 'all' },
});
export const GRACE_MS = 60_000;
export const CONNECT_TIMEOUT_MS = 8_000;
export const MAX_PLAYERS = 50; // Resource guard, not a verified network capacity.
export const MAX_QUESTIONS = 200;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_LIBRARY_BYTES = 20 * 1024 * 1024;
