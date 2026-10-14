// 簡易合成音效（Web Audio）
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.last = {}; }
  ensure() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  tone(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  }
  noise(dur, vol = 0.1) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx; const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = buf; const g = c.createGain(); g.gain.value = vol; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start();
  }
  play(ev) {
    if (!this.ctx) return;
    const now = performance.now(); if (this.last[ev] && now - this.last[ev] < (ev === 'hit' ? 90 : 60)) return; this.last[ev] = now;
    switch (ev) {
      case 'select': this.tone(660, 0.07, 'triangle', 0.08); break;
      case 'cmd': this.tone(520, 0.06, 'square', 0.05, 120); break;
      case 'hit': this.noise(0.08, 0.08); this.tone(180, 0.08, 'sawtooth', 0.05, -80); break;
      case 'build': this.tone(523, 0.12, 'triangle', 0.1); setTimeout(() => this.tone(784, 0.2, 'triangle', 0.1), 110); break;
      case 'train': this.tone(440, 0.08, 'triangle', 0.08); setTimeout(() => this.tone(587, 0.12, 'triangle', 0.08), 80); break;
      case 'age': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'triangle', 0.12), i * 130)); break;
      case 'alert': this.tone(300, 0.25, 'square', 0.08); setTimeout(() => this.tone(240, 0.3, 'square', 0.08), 200); break;
      case 'death': this.tone(220, 0.25, 'sawtooth', 0.05, -150); break;
      case 'destroy': this.noise(0.5, 0.2); this.tone(90, 0.5, 'sawtooth', 0.1, -50); break;
      case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 'triangle', 0.12), i * 160)); break;
      case 'lose': [440, 415, 392, 349].forEach((f, i) => setTimeout(() => this.tone(f, 0.6, 'sawtooth', 0.06), i * 300)); break;
    }
  }
}
