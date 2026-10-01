// Browser-only transport double: real UI and protocol, no external signaling/ICE.
class Emitter {
  events = new Map();
  on(name, callback) { const list = this.events.get(name) || []; list.push(callback); this.events.set(name, list); }
  emit(name, data) { for (const callback of this.events.get(name) || []) callback(data); }
}
class Connection extends Emitter {
  constructor(peer, remote, id) { super(); this.peer = peer; this.remote = remote; this.connectionId = id; this.open = false; }
  send(data) { this.peer.post({ kind: 'data', remote: this.remote, id: this.connectionId, data }); }
  close(notify = true) {
    if (!this.peer.connections.has(this.connectionId)) return;
    this.open = false; this.peer.connections.delete(this.connectionId);
    if (notify) this.peer.post({ kind: 'close', remote: this.remote, id: this.connectionId });
    this.emit('close');
  }
}
class Peer extends Emitter {
  constructor(id) {
    super(); this.id = typeof id === 'string' ? id : crypto.randomUUID();
    this.connections = new Map(); this.destroyed = false; this.disconnected = false;
    this.channel = new BroadcastChannel('quizparty-tests');
    this.channel.onmessage = ({ data: msg }) => {
      if (msg.remote !== this.id) return;
      let conn = this.connections.get(msg.id);
      if (msg.kind === 'offer') {
        conn = new Connection(this, msg.from, msg.id); this.connections.set(msg.id, conn);
        this.emit('connection', conn); conn.open = true; conn.emit('open');
        this.post({ kind: 'accept', remote: msg.from, id: msg.id });
      } else if (msg.kind === 'accept' && conn) { conn.open = true; conn.emit('open'); }
      else if (msg.kind === 'data' && conn) conn.emit('data', msg.data);
      else if (msg.kind === 'close' && conn) conn.close(false);
    };
    globalThis.testPeers ||= []; globalThis.testPeers.push(this);
    window.addEventListener('beforeunload', () => this.destroy());
    setTimeout(() => { if (!this.destroyed) this.emit('open', this.id); }, 20);
  }
  post(message) { if (!this.destroyed) this.channel.postMessage({ ...message, from: this.id }); }
  connect(remote) {
    const id = crypto.randomUUID(), conn = new Connection(this, remote, id);
    this.connections.set(id, conn);
    setTimeout(() => this.post({ kind: 'offer', remote, id }), 10);
    return conn;
  }
  reconnect() { this.disconnected = false; setTimeout(() => this.emit('open', this.id), 10); }
  destroy() {
    if (this.destroyed) return;
    for (const conn of [...this.connections.values()]) conn.close();
    this.destroyed = true; this.channel.close();
  }
}
globalThis.Peer = Peer;
globalThis.qrcode = () => ({ addData() {}, make() {}, createSvgTag() { return '<svg aria-label="QR simulado"></svg>'; } });
