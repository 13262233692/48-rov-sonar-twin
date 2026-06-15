export class SonarDataBuffer {
  constructor(maxPings = 600) {
    this.maxPings = maxPings;
    this.pings = [];
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  push(ping) {
    this.pings.push(ping);
    while (this.pings.length > this.maxPings) this.pings.shift();
    for (const fn of this.listeners) fn(ping, this);
  }

  clear() { this.pings.length = 0; }

  getAllPings() { return this.pings.slice(); }

  getLatest(n) { return this.pings.slice(-Math.min(n, this.pings.length)); }
}

export class SonarWSClient {
  constructor(url = 'ws://localhost:8765', buffer) {
    this.url = url;
    this.buffer = buffer || new SonarDataBuffer();
    this.ws = null;
    this._reconnectDelay = 1000;
    this._manualClose = false;
    this._statusListeners = new Set();
  }

  onStatus(fn) {
    this._statusListeners.add(fn);
    return () => this._statusListeners.delete(fn);
  }

  _setStatus(s) { for (const fn of this._statusListeners) fn(s); }

  connect() {
    this._manualClose = false;
    this._connect();
  }

  _connect() {
    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      this._scheduleReconnect();
      return;
    }
    this._setStatus('connecting');
    this.ws.onopen = () => this._setStatus('connected');
    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'sonar_ping') this.buffer.push(data);
      } catch (_) { }
    };
    this.ws.onclose = () => {
      this._setStatus('disconnected');
      if (!this._manualClose) this._scheduleReconnect();
    };
    this.ws.onerror = () => { try { this.ws.close(); } catch (_) {} };
  }

  _scheduleReconnect() {
    setTimeout(() => { if (!this._manualClose) this._connect(); }, this._reconnectDelay);
    this._reconnectDelay = Math.min(10000, this._reconnectDelay * 1.5);
  }

  close() {
    this._manualClose = true;
    if (this.ws) try { this.ws.close(); } catch (_) {}
  }
}
