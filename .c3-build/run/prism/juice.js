// juice.js — particles + a DELIBERATELY SUBTLE screen-shake (earlier build was
// "abnormally strong"; capped hard here). Electric, capsule, explosion and boss
// bursts; a brief flash on big events. No constant tremble.

import { TUNING } from './tuning.js';
import { ParticlePool, rng, rrange, clamp, TAU } from './core.js';

const JC = TUNING.col;

export class Juice {
  volt-flickeror() { this.particles = new ParticlePool(1200); this.reset(); }
  reset() { this.shake = 0; this.flash = 0; this.flashCol = '#ffffff'; this.freezeT = 0; this.slowmoT = 0; this.slowmoScale = 1; this.labels = []; this.particles.clear(); }

  // Floating wobble-rise-fade labels (damage-number style) — used for OVERPOWERED.
  spawnLabel(text, x, y, color = '#ffe23a', size = 34) {
    this.labels.push({ text, x, y, vy: -46, life: 1.3, maxLife: 1.3, wob: Math.random() * TAU, size, color });
  }

  // roadmap #5/#10: brief full-freeze (hitstop) + cinematic slow-mo. game.js
  // consumes freezeT/slowmoT each frame (they tick on REAL time, not game time).
  hitstop(t) { this.freezeT = Math.max(this.freezeT, t); }
  slowmo(t, scale) { this.slowmoT = Math.max(this.slowmoT, t); this.slowmoScale = scale; }

  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 36);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i]; l.life -= dt; l.y += l.vy * dt; l.wob += dt * 9;
      if (l.life <= 0) this.labels.splice(i, 1);
    }
    this.particles.update(dt);
  }
  offset() {
    if (this.shake <= 0.01) return { x: 0, y: 0 };
    return { x: (rng() * 2 - 1) * this.shake, y: (rng() * 2 - 1) * this.shake };
  }
  kick(a) { this.shake = Math.min(TUNING.shakeCap, this.shake + a); }
  flashScreen(col, amt) { this.flash = Math.max(this.flash, amt); this.flashCol = col; }

  dash(x, y) {
    this.particles.burst(x, y, 10, { color: JC.arc, speedMin: 60, speedMax: 260, lifeMin: 0.15, lifeMax: 0.4, sizeMin: 2, sizeMax: 4, additive: true, drag: 3 });
  }
  beamBurst(x, y, big) {
    this.particles.burst(x, y, big ? 34 : 12, { color: big ? JC.beamHot : JC.beam, speedMin: 80, speedMax: big ? 520 : 260, lifeMin: 0.2, lifeMax: 0.7, sizeMin: 2, sizeMax: big ? 6 : 4, additive: true, drag: 1.6 });
  }
  switchSpark(x, y) {
    this.particles.burst(x, y, 14, { color: JC.switchOn, speedMin: 60, speedMax: 240, lifeMin: 0.25, lifeMax: 0.6, sizeMin: 2, sizeMax: 4, additive: true, drag: 2 });
  }
  trapDetonate(x, y) {
    this.kick(2);
    this.particles.burst(x, y, 18, { color: JC.trap, speedMin: 80, speedMax: 320, grav: 500, lifeMin: 0.3, lifeMax: 0.8, sizeMin: 2, sizeMax: 5, drag: 1 });
  }
  capsule(x, y, big) {
    this.particles.burst(x, y, big ? 22 : 12, { color: big ? JC.capsuleB : JC.capsuleS, speedMin: 60, speedMax: 280, lifeMin: 0.25, lifeMax: 0.7, sizeMin: 2, sizeMax: 5, additive: true, drag: 2 });
  }
  enemyDie(x, y) {
    this.particles.burst(x, y, 18, { color: JC.enemy, speedMin: 90, speedMax: 360, grav: 600, lifeMin: 0.3, lifeMax: 0.8, sizeMin: 2, sizeMax: 6, drag: 0.8 });
  }
  hit(x, y) {
    this.kick(TUNING.shakeHit);
    this.flashScreen('#ff3b4e', 0.16);
    this.particles.burst(x, y, 16, { color: JC.trap, speedMin: 80, speedMax: 360, lifeMin: 0.2, lifeMax: 0.6, sizeMin: 2, sizeMax: 5, additive: true, drag: 1.5 });
  }
  death(x, y) {
    this.kick(TUNING.shakeDeath);
    this.flashScreen('#ff3b4e', 0.6);
    this.particles.burst(x, y, 40, { color: JC.voltMid, speedMin: 80, speedMax: 460, grav: 500, lifeMin: 0.4, lifeMax: 1.1, sizeMin: 2, sizeMax: 6, additive: true, drag: 0.9 });
  }
  bossCrack(x, y) {
    this.kick(6);
    this.particles.burst(x, y, 36, { color: '#ffffff', speedMin: 120, speedMax: 520, lifeMin: 0.3, lifeMax: 0.9, sizeMin: 2, sizeMax: 6, additive: true, drag: 1.2 });
  }
  bossDeath(x, y) {
    this.kick(TUNING.shakeCap);
    this.flashScreen('#aef2ff', 0.85);
    for (let k = 0; k < 3; k++) this.particles.burst(x + rrange(-60, 60), y + rrange(-40, 40), 30, { color: k % 2 ? JC.beamHot : JC.voltHi, speedMin: 120, speedMax: 560, lifeMin: 0.4, lifeMax: 1.2, sizeMin: 2, sizeMax: 7, additive: true, drag: 1 });
  }
  win(x, y) { this.flashScreen('#aef2ff', 0.7); this.kick(5); this.particles.burst(x, y, 50, { color: JC.beamHot, speedMin: 120, speedMax: 520, lifeMin: 0.4, lifeMax: 1.1, sizeMin: 2, sizeMax: 6, additive: true, drag: 1.1 }); }
}
