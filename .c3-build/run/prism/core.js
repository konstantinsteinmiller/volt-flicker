// core.js — math, geometry, rng, and a tiny particle pool.
// Pure functions, no engine state. Names are globally unique (the bundler
// flattens modules into one IIFE).

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const approach = (v, target, maxDelta) => {
  if (v < target) return Math.min(v + maxDelta, target);
  if (v > target) return Math.max(v - maxDelta, target);
  return v;
};
export const TAU = Math.PI * 2;
export const deg2rad = (d) => (d * Math.PI) / 180;

// Deterministic-ish rng wrapper (Math.random by default; swappable for tests).
let _rngSeed = 0x9e3779b9;
export const rngSeed = (s) => { _rngSeed = (s >>> 0) || 1; };
export const rng = () => {
  // xorshift32 — deterministic so solvability sweeps are repeatable.
  _rngSeed ^= _rngSeed << 13; _rngSeed >>>= 0;
  _rngSeed ^= _rngSeed >> 17;
  _rngSeed ^= _rngSeed << 5; _rngSeed >>>= 0;
  return _rngSeed / 0xffffffff;
};
export const rrange = (a, b) => a + (b - a) * rng();

// Axis-aligned box overlap. Boxes are {x,y,w,h} with x,y = top-left.
export const aabbOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const pointInRect = (px, py, r) =>
  px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

// Ray (origin o, unit dir d) vs AABB rect. Returns nearest positive t (entry
// distance) or Infinity if no hit within [0, maxT]. Slab method.
export const rayRect = (ox, oy, dx, dy, r, maxT = Infinity) => {
  let tmin = 0, tmax = maxT;
  // X slab
  if (Math.abs(dx) < 1e-9) {
    if (ox < r.x || ox > r.x + r.w) return Infinity;
  } else {
    let t1 = (r.x - ox) / dx;
    let t2 = (r.x + r.w - ox) / dx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  // Y slab
  if (Math.abs(dy) < 1e-9) {
    if (oy < r.y || oy > r.y + r.h) return Infinity;
  } else {
    let t1 = (r.y - oy) / dy;
    let t2 = (r.y + r.h - oy) / dy;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin >= 0 ? tmin : (tmax >= 0 ? 0 : Infinity);
};

// Shortest distance from point p to segment a→b (for beam-band hit tests).
export const distPointSeg = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - ax, py - ay);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - bx, py - by);
  const t = c1 / c2;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
};

// Rotate a unit vector by ±90° (used for refraction).
export const rot90 = (dx, dy, sign) => (sign >= 0 ? { x: -dy, y: dx } : { x: dy, y: -dx });

export const rectCenter = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// ── Particle pool ───────────────────────────────────────────────────────
// Fixed-cap ring so bursts never allocate during play. Each particle:
// {x,y,vx,vy,life,maxLife,size,color,grav,additive,spin,angle,va}.
export class ParticlePool {
  constructor(cap = 900) {
    this.cap = cap;
    this.p = new Array(cap);
    for (let i = 0; i < cap; i++) this.p[i] = { life: 0 };
    this.head = 0;
  }
  spawn(o) {
    const q = this.p[this.head];
    this.head = (this.head + 1) % this.cap;
    q.x = o.x; q.y = o.y;
    q.vx = o.vx || 0; q.vy = o.vy || 0;
    q.life = q.maxLife = o.life || 0.6;
    q.size = o.size || 3;
    q.color = o.color || '#fff';
    q.grav = o.grav || 0;
    q.additive = !!o.additive;
    q.drag = o.drag || 0;
    q.angle = o.angle || 0;
    q.va = o.va || 0;
  }
  burst(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const sp = rrange(opts.speedMin || 40, opts.speedMax || 220);
      this.spawn({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rrange(opts.lifeMin || 0.35, opts.lifeMax || 0.9),
        size: rrange(opts.sizeMin || 2, opts.sizeMax || 5),
        color: opts.color || '#fff',
        grav: opts.grav || 0,
        additive: opts.additive,
        drag: opts.drag || 1.5,
        angle: rng() * TAU, va: rrange(-8, 8)
      });
    }
  }
  update(dt) {
    const arr = this.p;
    for (let i = 0; i < this.cap; i++) {
      const q = arr[i];
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.drag) { const f = Math.exp(-q.drag * dt); q.vx *= f; q.vy *= f; }
      q.vy += q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.angle += q.va * dt;
    }
  }
  forEach(fn) {
    const arr = this.p;
    for (let i = 0; i < this.cap; i++) { if (arr[i].life > 0) fn(arr[i]); }
  }
  clear() { for (let i = 0; i < this.cap; i++) this.p[i].life = 0; }
}
