// audio.js — fully procedural WebAudio (no asset files). One-shot electric SFX
// for movement + both skills + combat. Lazily created on first gesture.

export class Audio2 {
  volt-flickeror() { this.ctx = null; this.master = null; this.muted = false; }
  _ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      this.ctx = new AC(); this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(this.ctx.destination);
    } catch { return false; } return true;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }

  _tone(freq, dur, type = 'square', gain = 0.2, slideTo = null) {
    if (this.muted || !this._ensure()) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  _noise(dur, gain = 0.2, freq = 1200, q = 1) {
    if (this.muted || !this._ensure()) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master); src.start(t); src.stop(t + dur);
  }

  jump() { this._tone(420, 0.14, 'square', 0.14, 720); }
  dash() { this._noise(0.16, 0.16, 1800, 0.6); this._tone(300, 0.18, 'sawtooth', 0.12, 1000); }
  beamCharge() { this._tone(180, 0.5, 'sawtooth', 0.08, 520); }
  beamFire(isMax) { if (isMax) { this._noise(0.4, 0.28, 700, 0.5); this._tone(120, 0.5, 'sawtooth', 0.22, 1400); } else { this._tone(820, 0.12, 'square', 0.14, 1300); } }
  radial(isBig) { if (isBig) { this._noise(0.4, 0.24, 500, 0.4); this._tone(90, 0.45, 'sine', 0.2, 260); } else { this._tone(300, 0.18, 'triangle', 0.14, 520); } }
  capsule(big) { this._tone(880, 0.1, 'square', 0.14, 1320); if (big) this._tone(1320, 0.14, 'sine', 0.12, 1760); }
  hit() { this._noise(0.25, 0.26, 600, 0.7); this._tone(200, 0.3, 'sawtooth', 0.16, 80); }
  enemyDie() { this._noise(0.18, 0.16, 900, 0.6); }
  bossHit() { this._noise(0.3, 0.24, 500, 0.5); this._tone(160, 0.3, 'square', 0.16, 320); }
  bossDeath() { const n = [523, 659, 784, 1047]; n.forEach((f, i) => setTimeout(() => this._tone(f, 0.5, 'triangle', 0.2), i * 110)); this._noise(0.6, 0.3, 400, 0.4); }
  death() { this._noise(0.5, 0.3, 400, 0.4); this._tone(220, 0.6, 'sawtooth', 0.22, 36); }
  win() { const n = [659, 784, 988, 1319]; n.forEach((f, i) => setTimeout(() => this._tone(f, 0.45, 'triangle', 0.18), i * 100)); }
}
