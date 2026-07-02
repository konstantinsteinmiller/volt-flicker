/* Prism Shift: OVERPOWERED — generated bundle. Do not edit by hand.
   Source: .c3-build/run/prism/*.js  →  rebuild with: node .c3-build/bundle.mjs */
(function(){
'use strict';

// ── tuning.js ──────────────────────────────────────────────
// tuning.js — Volt economy, movement feel, and palette for Project Volt-Flicker.
// World units are virtual pixels; the camera shows a VIEW_H-tall window scaled to
// the device, so the game is resolution-independent (see render.js / game.js).

const TUNING = {
  // ── Camera / responsiveness ───────────────────────────────────────────
  viewH: 640,            // visible world-height; scale = screenH / viewH
  viewHMin: 540,         // clamp so phones don't zoom in too far
  viewHMax: 820,         // and large screens don't zoom out too far

  // ── Volt economy (all values are PERCENT, 0..100) ─────────────────────
  voltMax: 100,
  voltStart: 100,
  voltDecayPerSec: 0.5,  // passive drain
  capsuleSmall: 10,
  capsuleBig: 30,
  costDash: 0.5,         // dash is cheap now
  costBeamTap: 2.5,
  costBeamMax: 35,       // Max Power Discharge; fatal if you can't afford it
  costRadialTap: 5,
  costRadialMax: 30,
  debtGrace: 1.6,        // seconds you survive on borrowed power while Volt < 0 (feature #4)
  // ── Overpowered state (roadmap #20 — the jam-theme core) ──
  voltOverMax: 150,      // capsules can overcharge Volt up to here
  overEnter: 110,        // surpass this → OVERPOWERED
  overExit: 100,         // drains until below this, then it ends
  overDrain: 5,          // %/s burned while overpowered
  overSpeedMult: 3,      // 3× movement speed
  // ── Checkpoint (roadmap #3) ──
  checkpointVolt: 40,    // respawn Volt at the last ground touched
  trapDrain: 20,         // trap contact
  enemyContactDrain: 18, // generic enemy/hazard contact
  bossBulletDrain: 9,
  enemyBulletDrain: 8,   // turret/shooter bullet

  // ── Movement (units, seconds) ─────────────────────────────────────────
  gravity: 2600,
  runSpeed: 360,
  runAccel: 4200,
  runDecel: 5200,
  airAccel: 2600,
  jumpVel: 880,
  maxFall: 1500,
  coyoteTime: 0.10,
  jumpBuffer: 0.10,
  maxAirJumps: 1,        // → double jump
  wallSlideSpeed: 220,
  wallJumpVX: 520,
  wallJumpVY: 820,
  wallStickTime: 0.12,
  dashSpeed: 1050,
  dashTime: 0.16,
  dashCooldown: 0.30,
  dashDoubleTapWindow: 0.26,
  hitInvuln: 0.9,        // i-frames after taking damage

  // ── Skill 1: Plasma Beam ──────────────────────────────────────────────
  beamDeadzone: 0.1,     // press shorter than this fires nothing (ignore stray clicks)
  beamMinHold: 0.5,      // legacy threshold (unused since beam is charge-scaled)
  beamMaxHold: 2.5,      // full Max Power
  beamTapSpeed: 1500,    // tap projectile speed (u/s)
  beamTapDmg: 10,
  beamTapRange: 360,
  beamMaxDmg: 1000,      // 100× base
  recoilBeamMin: 220,    // feature #3: knockback from a low charge
  recoilBeamMax: 950,    // knockback from a Max Power shot (beam-jump)
  recoilBeamLift: 0.2,   // fraction of recoil applied upward (gain air)
  recoilRadial: 760,     // upward pop from a charged radial (omnidirectional)
  beamMaxThick: 0.55,    // fraction of view height the max beam covers
  beamMaxDuration: 0.5,  // how long the max beam stays lethal
  beamChargeThickMin: 16, // mid-charge visual thickness range
  beamChargeThickMax: 72,
  beamDmgPad: 18,        // damage band extends this far BEYOND the visible beam edge
                         // so the WHOLE laser connects (overpowered), not just the core

  // ── Skill 2: Radial Discharge ─────────────────────────────────────────
  radialTapRadius: 150,
  radialTapDmg: 14,
  radialMinHold: 0.0,
  radialMaxHold: 1.6,
  radialMaxDuration: 0.45,
  radialDmgMax: 40,

  // ── Enemies / boss ────────────────────────────────────────────────────
  enemyHp: 12,
  enemyContactKnock: 260,
  shooterHp: 900,        // armored turret — only a full Max Power shot one-kills it
  shooterFireInterval: 1.5,
  enemyBulletSpeed: 230,
  breakableHp: 40,       // breakable wall — a charged/max shot or radial smashes it
  // ── enemy variety (roadmap #7) ──
  chargerHp: 50,         // rusher — sprints at you, dies fast
  chargerSpeed: 380,
  chargerAggro: 560,     // horizontal aggro range
  shieldedHp: 36,        // shielded foe — beam-proof until a Radial pops the shield
  // ── hit/kill feedback + boss telegraph (roadmap #5, #10) ──
  hitstopKill: 0.05,     // freeze on a Max Power kill (~3 frames)
  hitstopBoss: 0.12,     // freeze on a boss armor crack
  slowmoBossTime: 0.45,  // real-seconds of slow-mo after an armor crack
  slowmoScale: 0.32,     // gameplay time scale during slow-mo
  bossTelegraph: 0.5,    // wind-up flash before each volley
  // ── bloom post-process (roadmap #8) ──
  bloom: true,
  bloomScale: 0.35,      // offscreen resolution fraction
  bloomBlur: 7,          // px blur on the downsampled copy
  bloomAlpha: 0.55,      // additive strength
  bossArmorShots: 3,     // fully-charged max-power hits to win
  bossBulletSpeed: 240,
  bossBulletDmg: 9,
  // ── boss archetypes (distinct MMX-style brains, not just tiers) ──
  //   gunner (L3) · diver (L6) · warden (L9, relay-shield) · overlord (L12)
  bossDiveWind: 0.7,        // wind-up before a diver/overlord charge (locks the lane)
  bossDiveSpeed: 760,       // horizontal charge speed across the arena
  bossBoomerangTurn: 2.4,   // rad/s the warden's boomerangs curve (out + back)

  // ── Juice (kept subtle on purpose) ────────────────────────────────────
  shakeCap: 7,
  shakeBeamTap: 2.5,
  shakeBeamMax: 7,
  shakeHit: 5,
  shakeDeath: 7,

  // ── Palette ───────────────────────────────────────────────────────────
  col: {
    bg0: '#070b16',         // deep navy
    bg1: '#0d1530',
    shardDark: '#0a1024',
    shardEdge: 'rgba(90,140,220,0.10)',
    ground: '#10193a',
    groundEdge: '#2b4790',
    platform: '#142150',
    platformEdge: '#3b66c8',
    door: '#3a2a66',
    doorEdge: '#9a6bff',
    voltHi: '#ffe23a',      // hot lightning yellow (high volt)
    voltMid: '#7fd8ff',     // electric cyan
    voltLo: '#5b6b86',      // dull grey-blue (near 0)
    arc: '#bfe9ff',
    beam: '#9fe8ff',
    beamHot: '#ffffff',
    beamMax: '#aef2ff',
    radial: '#9a6bff',
    enemy: '#e2466a',       // red angular enemy
    enemyEdge: '#ff8aa2',
    enemy2: '#ff9a3c',
    trap: '#ff3b4e',
    trapArmed: '#ff7a3c',
    switchOff: '#5b6b86',
    switchOn: '#56e0a0',
    capsuleS: '#7fd8ff',
    capsuleB: '#ffe23a',
    boss: '#2a3566',
    bossEdge: '#7f9fff',
    bossCore: '#ff3b6a',
    hud: '#7fd8ff',
    hudWarn: '#ff3b4e',
    text: '#dff1ff'
  }
};


// ── core.js ──────────────────────────────────────────────
// core.js — math, geometry, rng, and a tiny particle pool.
// Pure functions, no engine state. Names are globally unique (the bundler
// flattens modules into one IIFE).

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, target, maxDelta) => {
  if (v < target) return Math.min(v + maxDelta, target);
  if (v > target) return Math.max(v - maxDelta, target);
  return v;
};
const TAU = Math.PI * 2;
const deg2rad = (d) => (d * Math.PI) / 180;

// Deterministic-ish rng wrapper (Math.random by default; swappable for tests).
let _rngSeed = 0x9e3779b9;
const rngSeed = (s) => { _rngSeed = (s >>> 0) || 1; };
const rng = () => {
  // xorshift32 — deterministic so solvability sweeps are repeatable.
  _rngSeed ^= _rngSeed << 13; _rngSeed >>>= 0;
  _rngSeed ^= _rngSeed >> 17;
  _rngSeed ^= _rngSeed << 5; _rngSeed >>>= 0;
  return _rngSeed / 0xffffffff;
};
const rrange = (a, b) => a + (b - a) * rng();

// Axis-aligned box overlap. Boxes are {x,y,w,h} with x,y = top-left.
const aabbOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const pointInRect = (px, py, r) =>
  px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

// Ray (origin o, unit dir d) vs AABB rect. Returns nearest positive t (entry
// distance) or Infinity if no hit within [0, maxT]. Slab method.
const rayRect = (ox, oy, dx, dy, r, maxT = Infinity) => {
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
const distPointSeg = (px, py, ax, ay, bx, by) => {
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
const rot90 = (dx, dy, sign) => (sign >= 0 ? { x: -dy, y: dx } : { x: dy, y: -dx });

const rectCenter = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// ── Particle pool ───────────────────────────────────────────────────────
// Fixed-cap ring so bursts never allocate during play. Each particle:
// {x,y,vx,vy,life,maxLife,size,color,grav,additive,spin,angle,va}.
class ParticlePool {
  volt-flickeror(cap = 900) {
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


// ── levels.js ──────────────────────────────────────────────
// levels.js — pure data. Camera follows the player. Top-left origin, y down.
//
// Schema:
//  platforms:[{x,y,w,h, wall?, bound?, move?:{x2,y2,period,phase}}]
//  blockers / breakables / doors / switches / traps / capsules / enemies / exit / tutorial
//  enemies type: patrol|float|tank|shooter|charger|shielded|relay
//  boss:{x,y,w,h, tier?, archetype?, armor?, relays?:[{x,y}]}   tier 1..4 sets armor
//
// Campaign shape (roadmap #21): a BOSS every 3 levels — 3,6,9,12. Each runs a
// DISTINCT MMX-style brain (enemies.js), not just a harder tier:
//   gunner  (L3) — stationary artillery: aimed spread + radial once cracked
//   diver   (L6) — Storm Eagle: hovers, locks your height, charge-dives the lane
//   warden  (L9) — Boomer Kuwanger: teleport-blinks + boomerangs, relay shield
//   overlord(L12)— Spark Mandrill finale: wall-dashes + sparks + swarm + enrage

// Bump when the built-in level data changes shape so stale editor overrides in
// localStorage (`prism_lvl_<index>`) auto-invalidate instead of shadowing the new
// built-ins. (Editor saves stamp this rev; loadLevelOverride drops mismatches.)
const LEVELS_REV = 5;

const mk = (l) => {
  l.platforms = (l.platforms || []).map((p) => ({ wall: false, ...p }));
  l.doors = (l.doors || []).map((d) => ({ open: false, ...d }));
  l.switches = (l.switches || []).map((s) => ({ on: false, ...s }));
  l.traps = (l.traps || []).map((t) => ({ period: 0, phase: 0, ...t }));
  l.capsules = (l.capsules || []).map((c) => ({ big: false, ...c }));
  l.enemies = (l.enemies || []).map((e) => ({ type: 'patrol', ...e }));
  l.tutorial = l.tutorial || [];
  return l;
};

const bounds = (w, h, floorH = 660) => [
  { x: 0, y: 0, w: 24, h: floorH, wall: true, bound: true },
  { x: w - 24, y: 0, w: 24, h: h, wall: true, bound: true }
];

// A reusable boss arena (platforms for dodging). relays optional (warden).
const bossArena = (id, name, tier, archetype, relays) => mk({
  id, name, w: 1400, h: 760, spawn: { x: 200, y: 600 }, facing: 1, tier,
  platforms: [
    { x: 0, y: 680, w: 1400, h: 80 },
    { x: 0, y: 0, w: 24, h: 680, wall: true, bound: true },
    { x: 1376, y: 0, w: 24, h: 760, wall: true, bound: true },
    { x: 120, y: 500, w: 200, h: 20 },
    { x: 1080, y: 500, w: 200, h: 20 },
    { x: 600, y: 380, w: 200, h: 20 },
    { x: 340, y: 280, w: 160, h: 20 },
    { x: 900, y: 280, w: 160, h: 20 }
  ],
  capsules: [
    { x: 90, y: 620, big: true }, { x: 1300, y: 620, big: true },
    { x: 200, y: 460 }, { x: 1180, y: 460 }, { x: 680, y: 340 },
    { x: 420, y: 240 }, { x: 960, y: 240 }, { x: 700, y: 620 }
  ],
  boss: { x: 540, y: 70, w: 240, h: 160, tier, archetype, relays }
});

const LEVELS = [
  // ── 1 ── Max Power (tutorial) ─────────────────────────────────────────
  mk({
    id: 1, name: 'Max Power', w: 2600, h: 720, spawn: { x: 120, y: 600 }, facing: 1,
    platforms: [
      { x: 0, y: 660, w: 880, h: 60 },
      { x: 1120, y: 660, w: 1480, h: 60 },
      { x: 0, y: 0, w: 24, h: 660, wall: true, bound: true },
      { x: 380, y: 536, w: 150, h: 22 },
      { x: 600, y: 432, w: 150, h: 22 },
      { x: 1300, y: 520, w: 150, h: 22 },
      { x: 2576, y: 0, w: 24, h: 720, wall: true, bound: true },
      { x: 560, y: 470, w: 360, h: 22 },
      { x: 720, y: 350, w: 200, h: 22 },
      { x: 896, y: 350, w: 24, h: 142 }
    ],
    breakables: [{ x: 720, y: 372, w: 22, h: 98 }],
    capsules: [
      { x: 300, y: 600 }, { x: 520, y: 600 }, { x: 1240, y: 600 }, { x: 1360, y: 480 },
      { x: 1700, y: 600 }, { x: 2000, y: 600 },
      { x: 786, y: 440, big: true }, { x: 834, y: 440, big: true }, { x: 810, y: 398, big: true }
    ],
    enemies: [
      { x: 440, y: 620, type: 'patrol', x1: 360, x2: 560 },
      { x: 760, y: 392, type: 'float', x1: 700, x2: 760 },
      { x: 1640, y: 596, type: 'shooter', hp: 900, w: 50, h: 64 },
      { x: 2120, y: 560, type: 'tank', hp: 600, w: 96, h: 96 }
    ],
    exit: { x: 2500, y: 540, w: 56, h: 120 },
    tutorial: [{ x: 2120, y: 360, skill: 'beam' }]
  }),

  // ── 2 ── The Spatial Discharge (radial-through-wall gate) ─────────────
  mk({
    id: 2, name: 'Spatial Discharge', w: 1400, h: 1500, spawn: { x: 110, y: 1380 }, facing: 1,
    platforms: [
      { x: 0, y: 1440, w: 1400, h: 60 },
      { x: 0, y: 0, w: 24, h: 1440, wall: true, bound: true },
      { x: 1376, y: 0, w: 24, h: 1500, wall: true, bound: true },
      { x: 1080, y: 0, w: 30, h: 700, wall: true },
      { x: 1080, y: 800, w: 30, h: 640 },
      { x: 150, y: 1310, w: 220, h: 22 },
      { x: 430, y: 1180, w: 220, h: 22 },
      { x: 170, y: 1050, w: 220, h: 22 },
      { x: 450, y: 920, w: 220, h: 22 },
      { x: 210, y: 790, w: 220, h: 22 },
      { x: 480, y: 660, w: 220, h: 22 },
      { x: 760, y: 800, w: 320, h: 22 },
      { x: 1110, y: 800, w: 170, h: 22 },
      { x: 1180, y: 980, w: 180, h: 22 },
      { x: 560, y: 560, w: 300, h: 22 },
      { x: 700, y: 440, w: 160, h: 22 },
      { x: 836, y: 440, w: 22, h: 142 }
    ],
    breakables: [{ x: 700, y: 462, w: 20, h: 98 }],
    doors: [{ id: 'g1', x: 1080, y: 700, w: 30, h: 100 }],
    switches: [{ x: 1120, y: 760, door: 'g1' }],
    traps: [{ x: 600, y: 1420, w: 170, h: 20 }, { x: 170, y: 1032, w: 220, h: 16, period: 2.4, phase: 0.4 }],
    capsules: [
      { x: 260, y: 1270 }, { x: 540, y: 1140 }, { x: 280, y: 1010 },
      { x: 385, y: 430, big: true }, { x: 320, y: 750 }, { x: 1270, y: 940, big: true },
      { x: 762, y: 530, big: true }, { x: 802, y: 530, big: true }, { x: 782, y: 488, big: true }
    ],
    enemies: [
      { x: 300, y: 1270, type: 'patrol', x1: 220, x2: 420 },
      { x: 540, y: 1100, type: 'float', x1: 470, x2: 650 },
      { x: 980, y: 760, type: 'float', x1: 880, x2: 1040 },
      { x: 640, y: 1380, type: 'shooter', hp: 1800, w: 56, h: 60 },
      { x: 520, y: 860, type: 'shooter', hp: 900, w: 48, h: 60 },
      { x: 900, y: 740, type: 'shooter', hp: 1800, w: 54, h: 60 },
      { x: 1180, y: 740, type: 'shooter', hp: 1800, w: 54, h: 60 }
    ],
    exit: { x: 1280, y: 1340, w: 56, h: 100 },
    tutorial: [{ x: 1050, y: 690, skill: 'radial' }]
  }),

  // ── 3 ── BOSS I: The First Flicker (gunner — stationary artillery) ────
  bossArena(3, 'The First Flicker', 1, 'gunner'),

  // ── 4 ── Power Surge (OVERPOWERED intro — overcharge & feel the rush) ──
  // MMX beats: warm-up → DROP INTO A CRATER (chargers + a shielded drifter) →
  // staircase climb-out → a moving-platform bridge over a death-pit → a turret
  // nest → an OVERCHARGE trove that blows you past 110% into OVERPOWERED, then a
  // one-shot-everything rush down a charger-lined corridor to the exit.
  mk({
    id: 4, name: 'Power Surge', w: 3600, h: 1000, spawn: { x: 120, y: 560 }, facing: 1,
    platforms: [
      ...bounds(3600, 1000, 900),
      { x: 0, y: 640, w: 700, h: 360 },                 // start plateau (T640)
      { x: 700, y: 880, w: 940, h: 120 },               // crater floor — drop in (T880)
      { x: 1480, y: 760, w: 150, h: 22 },               // climb-out step 1
      { x: 1280, y: 640, w: 150, h: 22 },               // climb-out step 2
      { x: 1500, y: 520, w: 160, h: 22 },               // climb-out step 3
      { x: 1720, y: 640, w: 520, h: 360 },              // upper ledge (T640)
      { x: 2280, y: 600, w: 160, h: 24, move: { x2: 2560, y2: 600, period: 3 } }, // bridge over the pit
      { x: 2720, y: 700, w: 880, h: 300 },              // landing + OP run-out (T700)
      { x: 2820, y: 520, w: 260, h: 22 }                // OVERCHARGE trove platform (T520)
    ],
    capsules: [
      { x: 300, y: 600 }, { x: 520, y: 600 },
      { x: 900, y: 840 }, { x: 1150, y: 840 }, { x: 1400, y: 820 }, // crater
      { x: 1280, y: 600 }, { x: 1500, y: 480 },                     // climb
      { x: 1850, y: 600 }, { x: 2080, y: 600 }, { x: 2780, y: 660 },
      // OVERCHARGE trove — load up past 110% → OVERPOWERED for the run-out
      { x: 2840, y: 480, big: true }, { x: 2900, y: 480, big: true }, { x: 2960, y: 480, big: true },
      { x: 3020, y: 480, big: true }, { x: 2880, y: 430, big: true }, { x: 2980, y: 430, big: true },
      { x: 3500, y: 660, big: true }
    ],
    enemies: [
      { x: 380, y: 600, type: 'charger', x1: 240, x2: 620 },      // warm-up (T640)
      { x: 1000, y: 840, type: 'charger', x1: 760, x2: 1240 },    // crater (T880)
      { x: 1380, y: 840, type: 'charger', x1: 1240, x2: 1600 },
      { x: 1100, y: 800, type: 'shielded', x1: 950, x2: 1420 },   // crater drifter (needs Radial)
      { x: 2120, y: 576, type: 'shooter', hp: 900, w: 50, h: 64 },// upper-ledge turret (T640)
      { x: 2900, y: 636, type: 'shooter', hp: 900, w: 50, h: 64 },// run-out turret (T700)
      { x: 3200, y: 660, type: 'charger', x1: 3140, x2: 3440 },   // OP-rush line (T700)
      { x: 3400, y: 660, type: 'charger', x1: 3300, x2: 3520 }
    ],
    exit: { x: 3500, y: 580, w: 56, h: 120 },
    tutorial: []
  }),

  // ── 5 ── Sealed Vault (OVERPOWERED gate — only an OP dash phases the wall) ──
  // MMX beats: a Radial gauntlet (shielded foes) → a mover over a death-pit → a
  // mandatory wall-climb set-piece (forgiving ledge zig-zag past a tall wall, with
  // a big-cap reward at the top) → drop to the gate floor, load the OVERCHARGE
  // trove, and DASH (while OVERPOWERED) straight through the solid, non-breakable
  // plug sealing the corridor. No other way through.
  mk({
    id: 5, name: 'Sealed Vault', w: 3000, h: 1100, spawn: { x: 120, y: 940 }, facing: 1,
    platforms: [
      ...bounds(3000, 1100, 1040),
      { x: 0, y: 1040, w: 760, h: 60 },                 // start floor (T1040)
      { x: 300, y: 920, w: 150, h: 22 },
      { x: 540, y: 820, w: 150, h: 22 },
      { x: 780, y: 980, w: 160, h: 24, move: { x2: 1020, y2: 980, period: 2.8 } }, // mover over pit
      { x: 1040, y: 1040, w: 520, h: 60 },              // mid floor (T1040)
      { x: 1560, y: 360, w: 26, h: 680, wall: true },   // tall climb wall (wall-jump assist)
      { x: 1380, y: 900, w: 150, h: 22 },               // climb zig-zag
      { x: 1180, y: 780, w: 150, h: 22 },
      { x: 1380, y: 660, w: 150, h: 22 },
      { x: 1180, y: 540, w: 150, h: 22 },
      { x: 1300, y: 420, w: 320, h: 22 },               // top landing (reward)
      { x: 1700, y: 520, w: 200, h: 22 },               // high road back down
      { x: 1980, y: 640, w: 200, h: 22 },
      { x: 2200, y: 1040, w: 800, h: 60 },              // gate floor (T1040)
      { x: 2300, y: 920, w: 240, h: 22 },               // OVERCHARGE trove platform
      { x: 2600, y: 0, w: 120, h: 960, bound: true }    // corridor seal (top → just above floor)
    ],
    // the OP-gate: non-breakable, non-boundary plug fills the only gap (at body
    // height on the floor). bound:false → the OVERPOWERED dash phases it; nothing
    // else gets through, over, or under.
    blockers: [{ x: 2600, y: 960, w: 120, h: 80, bound: false }],
    capsules: [
      { x: 200, y: 1000 }, { x: 360, y: 880 }, { x: 600, y: 780 },
      { x: 1100, y: 1000 }, { x: 1300, y: 1000 },
      { x: 1450, y: 860 }, { x: 1250, y: 740 }, { x: 1450, y: 620 }, { x: 1250, y: 500 },
      { x: 1400, y: 380, big: true },                   // top-landing reward
      { x: 1760, y: 480 }, { x: 2040, y: 600 },
      // OVERCHARGE trove — surge past 110% right before the plug
      { x: 2340, y: 880, big: true }, { x: 2400, y: 880, big: true }, { x: 2460, y: 880, big: true },
      { x: 2360, y: 830, big: true }, { x: 2440, y: 830, big: true }, { x: 2400, y: 1000, big: true },
      { x: 2820, y: 1000, big: true }                   // reward past the gate
    ],
    enemies: [
      { x: 400, y: 960, type: 'shielded', x1: 300, x2: 560 },     // gauntlet drifter (Radial)
      { x: 550, y: 1000, type: 'charger', x1: 380, x2: 740 },
      { x: 1400, y: 596, type: 'shooter', hp: 900, w: 50, h: 64 },// climb-ledge turret
      { x: 2350, y: 960, type: 'shielded', x1: 2260, x2: 2540 },
      { x: 2400, y: 1000, type: 'charger', x1: 2260, x2: 2560 }
    ],
    exit: { x: 2900, y: 920, w: 56, h: 120 },
    tutorial: []
  }),

  // ── 6 ── BOSS II: Storm Flicker (diver — charge-dives your height) ────
  bossArena(6, 'Storm Flicker', 2, 'diver'),

  // ── 7 ── Capacitor Run (island-hop over death-pits; movers + perched turrets) ─
  // MMX "ride the platforms" stage: chain jumps and three moving platforms across
  // bottomless pits, dodging floaters in the gaps and turrets on high perches.
  mk({
    id: 7, name: 'Capacitor Run', w: 3600, h: 900, spawn: { x: 120, y: 640 }, facing: 1,
    platforms: [
      ...bounds(3600, 900, 760),
      { x: 0, y: 760, w: 560, h: 140 },                 // start island (T760)
      { x: 760, y: 700, w: 260, h: 200 },               // island 2 (T700)
      { x: 1060, y: 660, w: 150, h: 24, move: { x2: 1200, y2: 660, period: 2.6 } }, // mover 1
      { x: 1260, y: 760, w: 300, h: 140 },              // island 3 (T760)
      { x: 1620, y: 700, w: 150, h: 24, move: { x2: 1760, y2: 700, period: 2.8 } }, // mover 2
      { x: 1900, y: 700, w: 360, h: 200 },              // island 4 (T700)
      { x: 2060, y: 560, w: 160, h: 22 },               // turret perch (T560)
      { x: 2300, y: 640, w: 150, h: 24, move: { x2: 2460, y2: 640, period: 2.4 } }, // mover 3
      { x: 2520, y: 760, w: 360, h: 140 },              // island 5 (T760)
      { x: 3120, y: 760, w: 480, h: 140 },              // final floor (T760)
      { x: 1300, y: 580, w: 160, h: 22 },               // high-ledge cap
      { x: 2600, y: 580, w: 160, h: 22 }
    ],
    capsules: [
      { x: 280, y: 720 }, { x: 880, y: 660 }, { x: 1130, y: 620 },
      { x: 1380, y: 720 }, { x: 1380, y: 540 },
      { x: 2000, y: 660 }, { x: 2080, y: 520 },
      { x: 2680, y: 540 }, { x: 2700, y: 720 },
      { x: 2600, y: 520, big: true }, { x: 3400, y: 720, big: true }
    ],
    enemies: [
      { x: 300, y: 720, type: 'charger', x1: 160, x2: 520 },      // start (T760)
      { x: 640, y: 600, type: 'float', x1: 580, x2: 740 },        // floater over pit 1
      { x: 1380, y: 696, type: 'shooter', hp: 900, w: 50, h: 64 },// island-3 turret
      { x: 2080, y: 500, type: 'shooter', hp: 1800, w: 54, h: 60 },// perch turret
      { x: 2000, y: 620, type: 'shielded', x1: 1920, x2: 2200 },  // island-4 drifter
      { x: 2700, y: 720, type: 'charger', x1: 2540, x2: 2860 },   // island 5
      { x: 3000, y: 640, type: 'float', x1: 2900, x2: 3100 },     // floater over final pit
      { x: 3350, y: 720, type: 'charger', x1: 3180, x2: 3520 }    // final floor
    ],
    exit: { x: 3500, y: 640, w: 56, h: 120 },
    tutorial: []
  }),

  // ── 8 ── Substation (two-switch AND-gate + breakable vault + mover-lift) ─
  // MMX hunt: the exit gate stays sealed until BOTH switches are thrown — one up
  // a left wall-climb (with a breakable-wall big-cap VAULT off the top), one up a
  // vertical mover-lift. Then cross the pit to the exit. Turrets + a drifter +
  // a timed spike strip keep the route honest.
  mk({
    id: 8, name: 'Substation', w: 3600, h: 900, spawn: { x: 120, y: 640 }, facing: 1,
    platforms: [
      ...bounds(3600, 900, 760),
      { x: 0, y: 760, w: 2080, h: 140 },                // floor 1 (up to the gate)
      { x: 2108, y: 760, w: 800, h: 140 },              // floor 2 (past the gate)
      { x: 3200, y: 760, w: 400, h: 140 },              // end floor (pit 2908..3200)
      { x: 2080, y: 0, w: 28, h: 640, wall: true, bound: true }, // gate pillar (door fills 640..760)
      { x: 480, y: 400, w: 216, h: 22 },                // VAULT cap-nook ledge (behind breakable)
      { x: 720, y: 400, w: 220, h: 22 },                // switch-1 platform
      { x: 700, y: 640, w: 160, h: 22 },                // climb step
      { x: 900, y: 520, w: 160, h: 22 },                // climb step
      { x: 1500, y: 640, w: 160, h: 24, move: { x2: 1500, y2: 380, period: 3.2 } }, // mover-lift to switch 2
      { x: 1680, y: 360, w: 220, h: 22 },               // switch-2 platform
      { x: 2960, y: 700, w: 150, h: 24, move: { x2: 3120, y2: 700, period: 2.6 } }, // mover over end pit
      { x: 2950, y: 560, w: 180, h: 22 }                // high perch (big-cap reward)
    ],
    breakables: [{ x: 696, y: 280, w: 20, h: 120 }],    // shoot it to open the vault nook
    doors: [{ id: 'g1', x: 2080, y: 640, w: 28, h: 120 }],
    switches: [{ x: 800, y: 380, door: 'g1' }, { x: 1780, y: 340, door: 'g1' }],
    traps: [{ x: 1450, y: 740, w: 180, h: 20, period: 2.0, phase: 0.3 }],
    capsules: [
      { x: 300, y: 720 }, { x: 780, y: 600 }, { x: 900, y: 480 },
      { x: 540, y: 360, big: true }, { x: 620, y: 360, big: true }, // vault reward
      { x: 1780, y: 320 }, { x: 1500, y: 560 },
      { x: 2300, y: 720 }, { x: 2700, y: 720 },
      { x: 2950, y: 520, big: true }, { x: 3450, y: 720, big: true }
    ],
    enemies: [
      { x: 600, y: 720, type: 'charger', x1: 440, x2: 820 },     // floor 1 (T760)
      { x: 1100, y: 660, type: 'shielded', x1: 1000, x2: 1300 }, // floor-1 drifter
      { x: 760, y: 336, type: 'shooter', hp: 900, w: 50, h: 64 },// guards switch 1
      { x: 2400, y: 720, type: 'charger', x1: 2200, x2: 2620 },  // floor 2
      { x: 2700, y: 700, type: 'shooter', hp: 1800, w: 54, h: 60 },
      { x: 3050, y: 640, type: 'float', x1: 2960, x2: 3140 },    // floater over end pit
      { x: 3350, y: 720, type: 'charger', x1: 3220, x2: 3520 }   // end floor
    ],
    exit: { x: 3500, y: 640, w: 56, h: 120 },
    tutorial: []
  }),

  // ── 9 ── BOSS III: Bastion Flicker (warden — blinks + boomerangs, relay shield) ─
  bossArena(9, 'Bastion Flicker', 3, 'warden', [{ x: 200, y: 470 }, { x: 1160, y: 470 }, { x: 670, y: 250 }]),

  // ── 10 ── Cascade (3-layer serpentine — climb each layer by WALL-JUMP) ─────
  // A complex stack: traverse the BOTTOM right, WALL-JUMP up Shaft A to the MID
  // layer, traverse it left (RADIAL through the gate wall to throw the hidden
  // switch and open the door), WALL-JUMP up Shaft B to the TOP, traverse right
  // over a mover + a DASH-gap to the exit. Beam-breakable secret vault on the
  // bottom; dense chargers/turrets/shielded/tank/float throughout.
  mk({
    id: 10, name: 'Cascade', w: 3000, h: 1700, spawn: { x: 120, y: 1560 }, facing: 1,
    platforms: [
      ...bounds(3000, 1700, 1640),
      // ===== BOTTOM layer (go right) T1640 =====
      { x: 0, y: 1640, w: 820, h: 60 },                 // B1
      { x: 1060, y: 1640, w: 760, h: 60 },              // B2 (pit 820..1060 → mover m1)
      { x: 2040, y: 1640, w: 936, h: 60 },              // B3 (pit 1820..2040 jump → Shaft A)
      { x: 840, y: 1580, w: 150, h: 24, move: { x2: 980, y2: 1580, period: 2.6 } }, // m1
      { x: 1300, y: 1500, w: 160, h: 22 }, { x: 1560, y: 1400, w: 160, h: 22 }, // detours/caps
      { x: 300, y: 1500, w: 180, h: 22 }, { x: 500, y: 1500, w: 200, h: 22 },   // beam vault A | nook B
      { x: 2820, y: 1040, w: 24, h: 480, wall: true },  // SHAFT A left wall (bottom gap 1520..1640)
      // ===== MID layer (go left) T1040, continuous floor 24..2820 =====
      { x: 24, y: 1040, w: 180, h: 60 },                // Shaft B channel base
      { x: 200, y: 1040, w: 2620, h: 60 },
      { x: 1240, y: 560, w: 28, h: 380, wall: true, bound: true }, // MID GATE wall (stops at door top; door fills 940..1040)
      { x: 1700, y: 560, w: 150, h: 24, move: { x2: 1700, y2: 800, period: 3 } }, // vertical cap-lift
      { x: 180, y: 440, w: 24, h: 500, wall: true },    // SHAFT B right wall (bottom gap 940..1040)
      // ===== TOP layer (go right) T440 =====
      { x: 210, y: 440, w: 550, h: 60 },                // T1 (Shaft B tops out beside it, open top)
      { x: 1020, y: 440, w: 680, h: 60 },               // T2 (pit 760..1020 → mover tm1)
      { x: 1960, y: 440, w: 1016, h: 60 },              // T3 (DASH-gap 1700..1960 → exit)
      { x: 800, y: 380, w: 150, h: 24, move: { x2: 940, y2: 380, period: 2.6 } }, // tm1
      { x: 1300, y: 300, w: 160, h: 22 }                // top cap perch
    ],
    breakables: [{ x: 480, y: 1380, w: 20, h: 120 }],   // beam through it to open the bottom vault
    doors: [{ id: 'gd1', x: 1240, y: 940, w: 28, h: 100 }],
    switches: [{ x: 1215, y: 1000, door: 'gd1' }],      // tucked behind the gate wall → RADIAL only
    traps: [
      { x: 1340, y: 1620, w: 160, h: 20, period: 1.8, phase: 0 },   // bottom
      { x: 1200, y: 420, w: 160, h: 20, period: 1.8, phase: 0.5 }   // top
    ],
    capsules: [
      { x: 200, y: 1600 }, { x: 600, y: 1560 }, { x: 1380, y: 1460 }, { x: 1620, y: 1360 },
      { x: 580, y: 1460, big: true }, { x: 650, y: 1460, big: true }, // vault reward
      { x: 2300, y: 1600 }, { x: 2600, y: 1560 },
      { x: 2500, y: 1000 }, { x: 1900, y: 960 }, { x: 600, y: 1000 }, { x: 1700, y: 520 },
      { x: 200, y: 400 }, { x: 1380, y: 260 }, { x: 2200, y: 400 }, { x: 1800, y: 300 },
      { x: 2880, y: 400, big: true }
    ],
    enemies: [
      { x: 500, y: 1600, type: 'charger', x1: 360, x2: 760 },          // BOTTOM
      { x: 1300, y: 1600, type: 'patrol', x1: 1100, x2: 1760 },
      { x: 1400, y: 1576, type: 'shooter', hp: 900, w: 50, h: 64 },
      { x: 1500, y: 1560, type: 'shielded', x1: 1400, x2: 1700 },
      { x: 2300, y: 1600, type: 'charger', x1: 2100, x2: 2600 },
      { x: 2700, y: 1544, type: 'tank', hp: 600, w: 96, h: 96 },
      { x: 2400, y: 1000, type: 'charger', x1: 2320, x2: 2740 },       // MID
      { x: 1900, y: 976, type: 'shooter', hp: 900, w: 50, h: 64 },
      { x: 1500, y: 960, type: 'shielded', x1: 1320, x2: 1700 },
      { x: 600, y: 1000, type: 'charger', x1: 300, x2: 1000 },
      { x: 300, y: 400, type: 'charger', x1: 220, x2: 700 },           // TOP
      { x: 1300, y: 376, type: 'shooter', hp: 900, w: 50, h: 64 },
      { x: 1400, y: 360, type: 'shielded', x1: 1320, x2: 1600 },
      { x: 2300, y: 400, type: 'charger', x1: 2000, x2: 2700 },
      { x: 1800, y: 300, type: 'float', x1: 1700, x2: 1960 }
    ],
    exit: { x: 2880, y: 320, w: 56, h: 120 },
    tutorial: []
  }),

  // ── 11 ── Meltdown Approach (a vertical TOWER — climb it with everything) ──
  // Ascend bottom→top: WALL-JUMP up Shaft 1 to the MID tier, fight left, BEAM
  // through a breakable, RADIAL the switch behind the gate wall to open the door,
  // WALL-JUMP up Shaft 2 to the TOP tier, then clear a DASH-gap to the summit
  // exit. Every tier is packed (chargers/turrets/shielded/tank/float) over a long
  // fall — the climb itself is the gate, so there's no "jump up and leave".
  mk({
    id: 11, name: 'Meltdown Approach', w: 2000, h: 2200, spawn: { x: 150, y: 2040 }, facing: 1,
    platforms: [
      ...bounds(2000, 2200, 2140),
      // ===== BASE tier (T2140) =====
      { x: 0, y: 2140, w: 2000, h: 60 },
      { x: 600, y: 2020, w: 180, h: 22 }, { x: 900, y: 1920, w: 180, h: 22 }, // detours/caps
      { x: 1760, y: 1640, w: 24, h: 440, wall: true },  // SHAFT 1 left wall (bottom gap 2080..2140)
      // ===== MID tier (T1640, go left) =====
      { x: 24, y: 1640, w: 180, h: 60 },                // Shaft 2 channel base
      { x: 200, y: 1640, w: 1576, h: 60 },              // MID floor
      { x: 1240, y: 1160, w: 28, h: 380, wall: true, bound: true }, // MID GATE (stops at door top; door fills 1540..1640)
      { x: 760, y: 1480, w: 160, h: 22 },               // mid ledge/cap
      { x: 200, y: 1140, w: 24, h: 440, wall: true },   // SHAFT 2 right wall (bottom gap 1580..1640)
      // ===== TOP tier (T1140, go right) =====
      { x: 230, y: 1140, w: 710, h: 60 },               // T-left (Shaft 2 tops out beside it, open top)
      { x: 1160, y: 1140, w: 816, h: 60 },              // T-right (DASH-gap 940..1160 → exit)
      { x: 500, y: 1020, w: 160, h: 22 }, { x: 1500, y: 1020, w: 160, h: 22 } // top caps
    ],
    breakables: [{ x: 900, y: 1520, w: 24, h: 120 }],   // MID: beam through it to keep going left
    doors: [{ id: 'g1', x: 1240, y: 1540, w: 28, h: 100 }],
    switches: [{ x: 1215, y: 1600, door: 'g1' }],       // tucked behind the gate wall → RADIAL only
    traps: [
      { x: 1000, y: 2120, w: 160, h: 20, period: 1.8, phase: 0 },   // base
      { x: 600, y: 1620, w: 160, h: 20, period: 2.0, phase: 0.5 }   // mid
    ],
    capsules: [
      { x: 300, y: 2100 }, { x: 660, y: 1980 }, { x: 960, y: 1880 }, { x: 1500, y: 2100 },
      { x: 1840, y: 1980 }, { x: 1500, y: 1600 }, { x: 820, y: 1440 }, { x: 600, y: 1600 },
      { x: 300, y: 1100 }, { x: 560, y: 980 }, { x: 1560, y: 980 }, { x: 1700, y: 1100 },
      { x: 960, y: 1880, big: true }, { x: 820, y: 1440, big: true }, { x: 1840, y: 1020, big: true }
    ],
    enemies: [
      { x: 400, y: 2100, type: 'charger', x1: 260, x2: 760 },          // BASE
      { x: 900, y: 2100, type: 'charger', x1: 800, x2: 1200 },
      { x: 1200, y: 2044, type: 'tank', hp: 600, w: 96, h: 96 },
      { x: 1500, y: 2076, type: 'shooter', hp: 900, w: 50, h: 64 },
      { x: 1500, y: 1600, type: 'charger', x1: 1300, x2: 1700 },       // MID (right of gate)
      { x: 1500, y: 1560, type: 'shielded', x1: 1320, x2: 1700 },
      { x: 1000, y: 1576, type: 'shooter', hp: 900, w: 50, h: 64 },    // MID (left of gate)
      { x: 600, y: 1600, type: 'charger', x1: 300, x2: 1000 },
      { x: 300, y: 1100, type: 'charger', x1: 240, x2: 880 },          // TOP
      { x: 600, y: 1060, type: 'shielded', x1: 520, x2: 880 },
      { x: 1500, y: 1076, type: 'shooter', hp: 1800, w: 54, h: 60 },
      { x: 1060, y: 1000, type: 'float', x1: 960, x2: 1180 },          // floater over the dash-gap
      { x: 1700, y: 1100, type: 'charger', x1: 1500, x2: 1900 }
    ],
    exit: { x: 1820, y: 1020, w: 56, h: 120 },
    tutorial: []
  }),

  // ── 12 ── BOSS IV: The Final Flicker (overlord — wall-dash + sparks + swarm + enrage) ─
  bossArena(12, 'The Final Flicker', 4, 'overlord')
];

const levelCount = () => LEVELS.length;


// ── world.js ──────────────────────────────────────────────
// world.js — live, mutable level instance. Holds solids (platforms, blockers,
// closed doors), switches, traps, capsules, enemies, the boss, and all flying
// projectiles. Owns simple per-frame updates (traps, doors, projectile motion);
// enemy/boss brains live in enemies.js, skills in skills.js.


class World {
  volt-flickeror() { this.reset(); }

  reset() {
    this.w = 1280; this.h = 720;
    this.platforms = [];
    this.blockers = [];     // solid walls that hide switches (radial bypasses)
    this.breakables = [];   // solid walls destroyed by player shots → reveal loot
    this.doors = [];
    this.switches = [];
    this.traps = [];
    this.capsules = [];
    this.enemies = [];
    this.projectiles = [];  // {x,y,vx,vy,r,dmg,from,life,alive}
    this.boss = null;
    this.exit = null;
    this.spawn = { x: 0, y: 0 };
    this.facing = 1;
    this.tutorial = [];
    this.time = 0;
    this.level = null;
  }

  load(level) {
    this.reset();
    this.level = level;
    this.w = level.w; this.h = level.h;
    this.spawn = { ...level.spawn };
    this.facing = level.facing || 1;
    this.platforms = level.platforms.map((p) => ({ ...p, _x0: p.x, _y0: p.y, dx: 0, dy: 0 }));
    // Flag level-boundary walls so the OVERPOWERED dash (which phases interior
    // walls) can never carry the player out of bounds (roadmap #20).
    for (const p of this.platforms) {
      if (p.bound === undefined) p.bound = (p.x <= 0 || p.y <= 0 || p.x + p.w >= this.w || p.y + p.h >= this.h);
    }
    this.blockers = (level.blockers || []).map((b) => ({ ...b }));
    this.breakables = (level.breakables || []).map((b) => ({
      x: b.x, y: b.y, w: b.w, h: b.h, hp: b.hp || TUNING.breakableHp, maxHp: b.hp || TUNING.breakableHp, alive: true, hitFlash: 0
    }));
    this.doors = level.doors.map((d) => ({ ...d, open: false }));
    this.switches = level.switches.map((s) => ({ ...s, on: false }));
    this.traps = level.traps.map((t) => ({ ...t, armed: true }));
    this.capsules = level.capsules.map((c) => ({ ...c, w: c.big ? 30 : 22, h: c.big ? 30 : 22, taken: false, bob: Math.random() * 6 }));
    this.enemies = level.enemies.map((e) => {
      const defHp = e.hp ?? (e.type === 'charger' ? TUNING.chargerHp : e.type === 'shielded' ? TUNING.shieldedHp : e.type === 'shooter' ? TUNING.shooterHp : TUNING.enemyHp);
      return {
        x: e.x, y: e.y, w: e.w || 40, h: e.h || 40, type: e.type,
        x1: e.x1 ?? e.x, x2: e.x2 ?? e.x, baseY: e.y, baseX: e.x, phase: Math.random() * 6,
        hp: defHp, maxHp: defHp, shield: e.type === 'shielded' || !!e.shield,
        dir: 1, vx: 0, vy: 0, alive: true, hitFlash: 0, shootT: 0
      };
    });
    this.exit = level.exit ? { ...level.exit } : null;
    this.tutorial = (level.tutorial || []).map((t) => ({ ...t }));
    if (level.boss) {
      const b = level.boss;
      const tier = b.tier || 1;
      const armor = b.armor || (2 + tier); // escalates: t1=3, t2=4, t3=5, t4=6
      // Each boss runs a distinct brain (see enemies.js). Default by tier for
      // back-compat: 1→gunner, 2→diver, 3→warden, 4→overlord.
      const archetype = b.archetype || ['gunner', 'diver', 'warden', 'overlord'][tier - 1] || 'gunner';
      this.boss = {
        x: b.x, y: b.y, w: b.w, h: b.h, baseX: b.x, baseY: b.y, tier, archetype,
        armor, maxArmor: armor,
        phaseT: 0, fireT: 1, telegraph: 0, childT: 2.5, hitFlash: 0,
        alive: true, dead: false, sway: 0,
        // archetype state machine (movement phases): lazily initialised by the brain
        state: null, stateT: 0, diveY: null, diveDir: 1, side: -1, wall: -1, sparkT: 0, ragT: 0,
        // tier ≥ 3: a shield held up by relay stations — destroy them all first.
        shielded: !!(b.relays && b.relays.length)
      };
      // relays are destructible enemies; the boss is invulnerable until all die.
      for (const r of (b.relays || [])) {
        this.enemies.push({
          x: r.x, y: r.y, w: 44, h: 44, type: 'relay', x1: r.x, x2: r.x, baseY: r.y, baseX: r.x,
          phase: Math.random() * 6, hp: 90, maxHp: 90, shield: false, dir: 1, vx: 0, vy: 0, alive: true, hitFlash: 0, shootT: 0
        });
      }
    }
  }

  // Everything the player collides with and beams are blocked by.
  solids() {
    const s = this.platforms.slice();
    for (const b of this.blockers) s.push(b);
    for (const b of this.breakables) if (b.alive) s.push(b);
    for (const d of this.doors) if (!d.open) s.push(d);
    return s;
  }

  damageBreakable(b, dmg) {
    if (!b.alive) return false;
    b.hp -= dmg; b.hitFlash = 0.15;
    if (b.hp <= 0) b.alive = false;
    return !b.alive;
  }

  triggerSwitch(sw) {
    if (sw.on) return;
    sw.on = true;
    // A door opens only when ALL switches targeting it are on (multi-switch gates).
    const allOn = this.switches.filter((s) => s.door === sw.door).every((s) => s.on);
    if (allOn) { const door = this.doors.find((d) => d.id === sw.door); if (door) door.open = true; }
  }

  spawnProjectile(p) { this.projectiles.push({ r: 6, life: 1.5, alive: true, from: 'player', ...p }); }

  // Spawn an energy capsule, nudging it clear of any solid it would be buried in
  // (capsules float, so an open spot — biased upward — stays reachable). Fixes
  // boss/enemy drops landing inside the level mesh and becoming uncollectable.
  dropCapsule(x, y, big = false) {
    const w = big ? 30 : 22, h = w;
    const free = (px, py) => px >= w && py >= h && px <= this.w - w && py <= this.h - h &&
      !this.solids().some((s) => aabbOverlap({ x: px - w / 2, y: py - h / 2, w, h }, s));
    let fx = clamp(x, w, this.w - w), fy = clamp(y, h, this.h - h);
    if (!free(fx, fy)) {
      // ring-search outward for the nearest open spot, preferring up then sideways
      const dirs = [[0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1]];
      let found = null;
      for (let r = 24; r <= 600 && !found; r += 24)
        for (const [dx, dy] of dirs) { if (free(x + dx * r, y + dy * r)) { found = [x + dx * r, y + dy * r]; break; } }
      if (found) { fx = found[0]; fy = found[1]; } else fy = h;
    }
    this.capsules.push({ x: fx, y: fy, w, h, big, taken: false, bob: Math.random() * 6 });
  }

  update(dt) {
    this.time += dt;
    // moving platforms (roadmap #11): oscillate between base and (move.x2,move.y2)
    for (const p of this.platforms) {
      if (!p.move) continue;
      const prevX = p.x, prevY = p.y;
      const t = Math.sin(((this.time + (p.move.phase || 0)) / p.move.period) * TAU) * 0.5 + 0.5;
      p.x = p._x0 + (p.move.x2 - p._x0) * t;
      p.y = p._y0 + (p.move.y2 - p._y0) * t;
      p.dx = p.x - prevX; p.dy = p.y - prevY;
    }
    // traps: timed ones toggle armed
    for (const t of this.traps) {
      if (t.period > 0) {
        const ph = ((this.time + t.phase) % t.period) / t.period;
        t.armed = ph < 0.6;
      }
    }
    // capsules bob
    for (const c of this.capsules) c.bob += dt;
    // breakable hit-flash decay
    for (const b of this.breakables) if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt * 6);
    // projectiles
    const solids = this.solids();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      // `turn` rotates the velocity each frame → curving arcs (warden boomerangs)
      if (p.turn) {
        const c = Math.cos(p.turn * dt), s = Math.sin(p.turn * dt);
        const vx = p.vx * c - p.vy * s; p.vy = p.vx * s + p.vy * c; p.vx = vx;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      let dead = p.life <= 0;
      if (!dead && p.x < 0 || p.x > this.w || p.y < -50 || p.y > this.h + 50) dead = true;
      if (!dead) {
        const box = { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };
        if (p.from === 'player') {
          // player shots smash breakables + damage enemies/boss
          for (const b of this.breakables) { if (b.alive && aabbOverlap(box, b)) { this.damageBreakable(b, p.dmg); dead = true; break; } }
          if (!dead) for (const e of this.enemies) { if (e.alive && aabbOverlap(box, e)) { this.damageEnemy(e, p.dmg); dead = true; break; } }
          if (!dead && this.boss && this.boss.alive && aabbOverlap(box, this.boss)) { this.boss.hitFlash = 0.15; dead = true; }
        }
        // any projectile dies on a solid wall (breakables included)
        if (!dead) for (const s of solids) { if (aabbOverlap(box, s)) { dead = true; break; } }
      }
      if (dead) { p.alive = false; this.projectiles.splice(i, 1); }
    }
  }

  damageEnemy(e, dmg, kind = 'beam') {
    if (!e.alive) return false;
    // Shielded foes are beam/projectile-proof until a Radial pops the shield.
    if (e.shield && kind !== 'radial') { e.hitFlash = 0.1; return false; }
    e.hp -= dmg; e.hitFlash = 0.12;
    if (e.hp <= 0) e.alive = false;
    return !e.alive;
  }

  enemiesAlive() { return this.enemies.filter((e) => e.alive).length; }
}


// ── player.js ──────────────────────────────────────────────
// player.js — the lightning entity. Nimble platforming (run, jump, double-jump,
// wall-slide, wall-jump, lightning dash) + the single Volt resource (health AND
// ammo). Movement is free; dash and skills cost Volt; 0% = death.


const PT = TUNING;

class Player {
  volt-flickeror() { this.w = 34; this.h = 42; this.reset(0, 0, 1); }

  reset(x, y, facing = 1) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.facing = facing;
    this.onGround = false; this.wallDir = 0; this.sliding = false;
    this.airJumps = 0; this.coyote = 0; this.jumpBuffer = 0;
    this.dashQueued = false; this.dashing = false; this.dashTimer = 0; this.dashCd = 0;
    this.volt = PT.voltStart;
    this.debtTimer = PT.debtGrace; // feature #4: grace window while Volt < 0
    this.invuln = 0;
    this.alive = true;
    this.hitFlash = 0;
    this.trail = [];      // dash afterimages
    this._ground = null;  // platform currently stood on (for moving-platform carry)
    this.over = false;    // OVERPOWERED state (roadmap #20)
    this.justDashed = false; this.justJumped = false; this.justWallJumped = false;
  }

  get box() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get voltFrac() { return clamp(this.volt / PT.voltMax, 0, 1); }

  // ── Volt economy with overdraw / debt (feature #4) ──────────────────────
  // You may fire skills you can't afford: Volt drops BELOW zero into debt and a
  // grace timer (debtTimer, managed in game._step) counts down to flatline.
  // canSpend lets you overdraw until the −voltMax floor.
  canSpend() { return this.alive && this.volt > -PT.voltMax; }
  spend(c) { this.volt = Math.max(this.volt - c, -PT.voltMax); }
  addVolt(d) { this.volt = Math.min(this.volt + d, PT.voltOverMax); } // capsules can overcharge past 100% (roadmap #20)

  hit(amount) {
    if (!this.alive || this.invuln > 0 || this.dashing) return false;
    this.volt = Math.max(this.volt - amount, -PT.voltMax);
    this.invuln = PT.hitInvuln; this.hitFlash = 1;
    return true; // death is decided by the debt grace timer in game._step
  }
  _die() { this.alive = false; }

  tryJump() { this.jumpBuffer = PT.jumpBuffer; }
  tryDash() { this.dashQueued = true; }

  update(dt, input, world) {
    if (!this.alive) return;
    this.justDashed = this.justJumped = this.justWallJumped = false;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);

    const dir = input.moveDir | 0;
    if (dir !== 0 && !this.dashing) this.facing = dir;

    const solids = world.solids();

    // ── dash ────────────────────────────────────────────────────────────
    if (this.dashQueued) {
      this.dashQueued = false;
      if (!this.dashing && this.dashCd <= 0 && this.canSpend(PT.costDash)) {
        this.dashing = true; this.dashTimer = PT.dashTime; this.dashDir = this.facing;
        this.spend(PT.costDash); this.justDashed = true; this.invuln = Math.max(this.invuln, PT.dashTime + 0.02);
        this.vy = 0;
      }
    }
    if (this.dashing) {
      this.vx = this.dashDir * PT.dashSpeed; this.vy = 0;
      this.dashTimer -= dt;
      this.trail.push({ x: this.cx, y: this.cy, a: 1 });
      if (this.dashTimer <= 0) { this.dashing = false; this.dashCd = PT.dashCooldown; this.vx *= 0.4; }
    } else {
      // ── horizontal (3× while OVERPOWERED — roadmap #20) ──
      const target = dir * PT.runSpeed * (this.over ? PT.overSpeedMult : 1);
      const accel = (this.onGround ? (dir !== 0 ? PT.runAccel : PT.runDecel) : PT.airAccel) * (this.over ? PT.overSpeedMult : 1) * dt;
      this.vx = approach(this.vx, target, accel);
      // ── gravity / wall slide ──
      this.vy += PT.gravity * dt;
      this.sliding = false;
      if (!this.onGround && this.wallDir !== 0 && dir === this.wallDir && this.vy > 0) {
        this.vy = Math.min(this.vy, PT.wallSlideSpeed); this.sliding = true;
      }
      this.vy = clamp(this.vy, -Infinity, PT.maxFall);
      // ── jump / double / wall ──
      if (this.jumpBuffer > 0) {
        if (this.onGround || this.coyote > 0) {
          this.vy = -PT.jumpVel; this.jumpBuffer = 0; this.coyote = 0; this.airJumps = PT.maxAirJumps; this.justJumped = true;
        } else if (this.wallDir !== 0) {
          this.vy = -PT.wallJumpVY; this.vx = -this.wallDir * PT.wallJumpVX;
          this.facing = -this.wallDir; this.jumpBuffer = 0; this.airJumps = PT.maxAirJumps;
          this.justWallJumped = true; this.wallDir = 0;
        } else if (this.airJumps > 0) {
          this.vy = -PT.jumpVel; this.airJumps--; this.jumpBuffer = 0; this.justJumped = true;
        }
      }
    }

    // ride a moving platform: carry by the platform's last delta (roadmap #11)
    if (this._ground && this._ground.move) { this.x += this._ground.dx; this.y += this._ground.dy; }

    // ── integrate + collide ──────────────────────────────────────────────
    const wasGround = this.onGround;
    this.onGround = false; this._ground = null; let wall = 0;
    this.x += this.vx * dt;
    this._resolve(solids, 'x', (side) => { wall = side; });
    this.y += this.vy * dt;
    this._resolve(solids, 'y');
    this.wallDir = (!this.onGround && wall !== 0) ? wall : 0;
    if (this.onGround) { this.airJumps = PT.maxAirJumps; this.coyote = PT.coyoteTime; }
    else if (wasGround) { this.coyote = PT.coyoteTime; }

    // bounds
    this.x = clamp(this.x, 0, world.w - this.w);
    if (this.y > world.h + 200) { this.volt = 0; this._die(); } // fell out

    // trail fade
    for (const t of this.trail) t.a -= dt * 3.5;
    while (this.trail.length && this.trail[0].a <= 0) this.trail.shift();
  }

  _resolve(solids, axis, onWall) {
    const me = this.box;
    // OVERPOWERED dash phases through interior walls (not level boundaries) — #20
    const phasing = this.over && this.dashing;
    for (const s of solids) {
      if (phasing && !s.bound) continue;
      if (!aabbOverlap(me, s)) continue;
      if (axis === 'x') {
        const fromLeft = (me.x + me.w / 2) < (s.x + s.w / 2);
        this.x = fromLeft ? s.x - me.w : s.x + s.w;
        this.vx = 0; me.x = this.x;
        if (onWall) onWall(fromLeft ? 1 : -1); // wallDir = direction player faces into wall
      } else {
        const fromTop = (me.y + me.h / 2) < (s.y + s.h / 2);
        if (fromTop) { this.y = s.y - me.h; this.onGround = true; this._ground = s; }
        else { this.y = s.y + s.h; }
        this.vy = 0; me.y = this.y;
      }
    }
  }
}


// ── enemies.js ──────────────────────────────────────────────
// enemies.js — enemy brains (patrol / float / tank) and the boss bullet-hell AI
// + the 3-Max-Power-shot armor loop that refuels the player with Big capsules.
// All functions operate on the World passed in (no engine state of their own).


const ET = TUNING;

// True if the enemy's body at candidate x would overlap a solid WALL/platform
// (the 2px vertical inset ignores the surface it stands on / a flush ceiling).
// Keeps ground & drifting foes from sliding through walls and obstacles.
const enemyHitsWall = (world, e, x) => {
  for (const s of world.solids()) {
    if (s.x < x + e.w && s.x + s.w > x && s.y < e.y + e.h - 2 && s.y + s.h > e.y + 2) return true;
  }
  return false;
};

const updateEnemies = (world, dt, player) => {
  for (const e of world.enemies) {
    if (!e.alive) continue;
    e.hitFlash = Math.max(0, e.hitFlash - dt * 6);
    e.phase += dt;
    if (e.type === 'patrol') {
      const span = Math.max(1, e.x2 - e.x1);
      const t = (Math.sin(e.phase * 1.4) * 0.5 + 0.5);
      const nx = e.x1 + t * span;
      if (!enemyHitsWall(world, e, nx)) { e.dir = nx > e.x ? 1 : -1; e.x = nx; }
    } else if (e.type === 'float') {
      const span = Math.max(1, e.x2 - e.x1);
      const nx = e.x1 + (Math.sin(e.phase * 1.1) * 0.5 + 0.5) * span;
      if (!enemyHitsWall(world, e, nx)) e.x = nx;
      e.y = e.baseY + Math.sin(e.phase * 2.2) * 26;
    } else if (e.type === 'shooter') {
      // armored turret: stationary, bobs slightly, fires aimed bullets at the player
      e.y = e.baseY + Math.sin(e.phase * 1.6) * 8;
      e.shootT = (e.shootT || ET.shooterFireInterval) - dt;
      if (e.shootT <= 0 && player && player.alive) {
        e.shootT = ET.shooterFireInterval;
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
        const a = Math.atan2(player.cy - cy, player.cx - cx);
        world.projectiles.push({ x: cx, y: cy, vx: Math.cos(a) * ET.enemyBulletSpeed, vy: Math.sin(a) * ET.enemyBulletSpeed, r: 8, dmg: ET.enemyBulletDrain, from: 'enemy', life: 6, alive: true });
      }
    } else if (e.type === 'charger') {
      // rusher: sprints toward the player when in range, within its zone
      let nx = e.x;
      if (player && player.alive && Math.abs(player.cx - (e.x + e.w / 2)) < ET.chargerAggro) {
        e.dir = player.cx > e.x + e.w / 2 ? 1 : -1;
        nx = e.x + e.dir * ET.chargerSpeed * dt;
      } else {
        nx = e.baseX + Math.sin(e.phase * 1.2) * Math.max(1, (e.x2 - e.x1) / 2);
      }
      if (e.x1 !== e.x2) nx = Math.max(Math.min(nx, e.x2), e.x1);
      if (!enemyHitsWall(world, e, nx)) e.x = nx; // never barrel through a wall
    } else if (e.type === 'shielded') {
      // drifts like a float foe; beam-proof until a Radial pops its shield
      const span = Math.max(1, e.x2 - e.x1);
      const nx = e.x1 + (Math.sin(e.phase * 0.9) * 0.5 + 0.5) * span;
      if (!enemyHitsWall(world, e, nx)) e.x = nx;
      e.y = e.baseY + Math.sin(e.phase * 1.7) * 18;
    } else if (e.type === 'relay') {
      // shield-generator node: stationary, gently bobs; destroy all to drop the boss shield
      e.y = e.baseY + Math.sin(e.phase * 2) * 4;
    }
    // tank: stationary blocker (no movement)
  }
};

// ── shared boss helpers ────────────────────────────────────────────────────
const shoot = (world, x, y, ang, speed, dmg, extra = {}) =>
  world.projectiles.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 9, dmg, from: 'boss', life: 6, alive: true, ...extra });

// aimed fan of bullets toward the player; widens as armor is stripped
const fireSpread = (world, b, player, fromBottom = true) => {
  const cx = b.x + b.w / 2, cy = fromBottom ? b.y + b.h : b.y + b.h / 2;
  const crack = b.maxArmor - b.armor;
  const ang = Math.atan2(player.cy - cy, player.cx - cx);
  const n = 3 + crack;
  for (let i = 0; i < n; i++) shoot(world, cx, cy, ang + (i - (n - 1) / 2) * 0.18, ET.bossBulletSpeed, ET.bossBulletDmg);
};

// full radial ring (panic pattern)
const fireRing = (world, b, count) => {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  for (let i = 0; i < count; i++) shoot(world, cx, cy, (i / count) * TAU + b.phaseT, ET.bossBulletSpeed * 0.8, ET.bossBulletDmg);
};

// spawn capped harasser turrets (overlord swarm)
const spawnChildren = (world, b, dt, player, cap, every) => {
  b.childT -= dt;
  const live = world.enemies.filter((e) => e.child && e.alive).length;
  if (b.childT <= 0 && live < cap && player.alive) {
    b.childT = every;
    const cx = b.x + b.w / 2 + rrange(-b.w / 2, b.w / 2), cy = b.y + b.h * 0.6;
    world.enemies.push({ x: cx, y: cy, w: 30, h: 30, type: 'shooter', child: true, x1: cx, x2: cx, baseY: cy, baseX: cx, phase: Math.random() * 6, hp: 24, maxHp: 24, shield: false, dir: 1, vx: 0, vy: 0, alive: true, hitFlash: 0, shootT: rrange(0.6, 1.6) });
  }
};

// telegraphed volley scheduler (gunner): wind-up flash, then fire (roadmap #10)
const scheduleVolley = (world, b, dt, player, interval, fire) => {
  if (b.telegraph > 0) {
    b.telegraph -= dt;
    if (b.telegraph <= 0 && player.alive) fire();
  } else {
    b.fireT -= dt;
    if (b.fireT <= 0 && player.alive) { b.fireT = Math.max(0.4, interval); b.telegraph = ET.bossTelegraph; }
  }
};

// ── archetype brains ────────────────────────────────────────────────────────

// L3 — GUNNER: stationary artillery; sways across the top, aimed spread + (once
// cracked) a radial ring. The readable baseline the others diverge from.
const bossGunner = (world, b, dt, player) => {
  b.sway += dt;
  b.x = b.baseX + Math.sin(b.sway * 0.7) * 180;
  b.y = b.baseY;
  const interval = 1.3 - (b.maxArmor - b.armor) * 0.12;
  scheduleVolley(world, b, dt, player, interval, () => {
    fireSpread(world, b, player);
    if (b.maxArmor - b.armor >= 1) fireRing(world, b, 12 + (b.maxArmor - b.armor) * 4);
  });
};

// L6 — DIVER (Storm Eagle): hovers on one side dropping a feather-rain fan, then
// LOCKS the player's height and CHARGE-DIVES across the arena. Dash or jump out
// of the telegraphed lane. A mobile aggressor, not a turret.
const bossDiver = (world, b, dt, player) => {
  if (!b.state) { b.state = 'hover'; b.stateT = 1.2; }
  b.stateT -= dt;
  if (b.state === 'hover') {
    const targX = b.side < 0 ? 120 : world.w - 120 - b.w;
    b.x += (targX - b.x) * Math.min(1, dt * 3);
    b.y = b.baseY + Math.sin(b.phaseT * 3) * 12;
    b.fireT -= dt;
    if (b.fireT <= 0 && player.alive) {
      b.fireT = 0.55;
      const cx = b.x + b.w / 2, n = 3 + (b.maxArmor - b.armor);
      for (let i = 0; i < n; i++) shoot(world, cx, b.y + b.h, Math.PI / 2 + (i - (n - 1) / 2) * 0.22, ET.bossBulletSpeed * 0.7, ET.bossBulletDmg);
    }
    if (b.stateT <= 0) { b.state = 'wind'; b.stateT = ET.bossDiveWind; b.diveY = clamp(player.cy - b.h / 2, 110, world.h - 200); }
  } else if (b.state === 'wind') {
    b.y += (b.baseY - b.y) * Math.min(1, dt * 5); // pull back up to lunge
    if (b.stateT <= 0) { b.state = 'dive'; b.diveDir = b.side < 0 ? 1 : -1; }
  } else if (b.state === 'dive') {
    b.y += (b.diveY - b.y) * Math.min(1, dt * 9);
    b.x += b.diveDir * ET.bossDiveSpeed * dt;
    if ((b.diveDir > 0 && b.x + b.w >= world.w - 24) || (b.diveDir < 0 && b.x <= 24)) {
      b.state = 'recover'; b.stateT = 0.7; b.side = -b.side; b.diveY = null;
    }
  } else { // recover — vulnerable climb back to the top
    b.y += (b.baseY - b.y) * Math.min(1, dt * 3);
    if (b.stateT <= 0) { b.state = 'hover'; b.stateT = 1.0; }
  }
};

// L9 — WARDEN (Boomer Kuwanger): teleport-blinks around the arena throwing
// returning boomerang arcs. Its shield (3 relays) holds until they're destroyed;
// after that each blink leaves a longer exposed window — time your Max Power.
const bossWarden = (world, b, dt, player) => {
  if (!b.state) { b.state = 'attack'; b.stateT = 0.6; }
  b.stateT -= dt;
  b.y = b.baseY + Math.sin(b.phaseT * 2) * 14;
  if (b.state === 'attack') {
    // exposed: throw a boomerang then re-blink. Window is longer once unshielded.
    if (b.stateT <= 0 && player.alive) {
      fireBoomerang(world, b, player);
      b.state = 'blink'; b.stateT = b.shielded ? 1.1 : 1.6;
    }
  } else { // blink: brief fade, then reappear elsewhere and pause (the punish gap)
    if (b.stateT <= 0) {
      b.x = rrange(180, world.w - 180 - b.w);
      b.baseY = rrange(100, 340);
      b.state = 'attack'; b.stateT = b.shielded ? 0.7 : 1.1;
    }
  }
};

const fireBoomerang = (world, b, player) => {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const base = Math.atan2(player.cy - cy, player.cx - cx);
  for (const s of [-1, 1]) shoot(world, cx, cy, base, ET.bossBulletSpeed, ET.bossBulletDmg, { life: 3.2, turn: s * ET.bossBoomerangTurn });
};

// L12 — OVERLORD (Spark Mandrill finale): clings to a wall at the player's
// height firing aimed shots, then WALL-DASHES across raining ceiling sparks —
// plus a harasser swarm and, at low armor, a radial enrage. The everything-fight.
const bossOverlord = (world, b, dt, player) => {
  spawnChildren(world, b, dt, player, 4, 2.4);
  if (!b.state) { b.state = 'cling'; b.stateT = 1.5; }
  b.stateT -= dt;
  if (b.state === 'cling') {
    const wx = b.wall < 0 ? 24 : world.w - 24 - b.w;
    b.x += (wx - b.x) * Math.min(1, dt * 4);
    b.y = clamp(player.cy - b.h / 2 + Math.sin(b.phaseT * 2) * 18, 90, world.h - 220);
    b.fireT -= dt;
    if (b.fireT <= 0 && player.alive) { b.fireT = 0.7; fireSpread(world, b, player, false); }
    if (b.stateT <= 0) { b.state = 'wind'; b.stateT = ET.bossDiveWind; b.diveY = clamp(player.cy - b.h / 2, 90, world.h - 220); }
  } else if (b.state === 'wind') {
    if (b.stateT <= 0) { b.state = 'dash'; b.diveDir = b.wall < 0 ? 1 : -1; }
  } else if (b.state === 'dash') {
    b.y += (b.diveY - b.y) * Math.min(1, dt * 9);
    b.x += b.diveDir * ET.bossDiveSpeed * 1.15 * dt;
    b.sparkT -= dt;
    if (b.sparkT <= 0) { b.sparkT = 0.11; shoot(world, b.x + b.w / 2, b.y, Math.PI / 2, ET.bossBulletSpeed * 0.9, ET.bossBulletDmg); }
    if ((b.diveDir > 0 && b.x + b.w >= world.w - 24) || (b.diveDir < 0 && b.x <= 24)) {
      b.state = 'cling'; b.stateT = 1.3; b.wall = -b.wall; b.diveY = null;
    }
  }
  // enrage: radial bursts when the armor is nearly gone
  if (b.armor <= 2) {
    b.ragT -= dt;
    if (b.ragT <= 0 && player.alive) { b.ragT = 2.0; fireRing(world, b, 16); }
  }
};

const BOSS_BRAINS = { gunner: bossGunner, diver: bossDiver, warden: bossWarden, overlord: bossOverlord };

const updateBoss = (world, dt, player) => {
  const b = world.boss;
  if (!b || !b.alive) return;
  b.hitFlash = Math.max(0, b.hitFlash - dt * 3);
  b.phaseT += dt;
  // shield stays up while any relay station survives (warden, roadmap #21)
  if (b.shielded) b.shielded = world.enemies.some((e) => e.type === 'relay' && e.alive);
  (BOSS_BRAINS[b.archetype] || bossGunner)(world, b, dt, player);
};

// A fully-charged Max Power shot connects with the boss.
const bossTakeMaxHit = (world, juice, audio) => {
  const b = world.boss;
  if (!b || !b.alive) return;
  // Shield up (relays alive) → the hit is deflected; destroy the relays first.
  if (b.shielded) { b.hitFlash = 0.5; juice?.spawnLabel('SHIELDED', b.x + b.w / 2, b.y, '#7fd8ff', 28); audio?.bossHit(); return; }
  b.armor = Math.max(0, b.armor - 1);
  b.hitFlash = 1;
  juice?.bossCrack(b.x + b.w / 2, b.y + b.h / 2);
  juice?.hitstop(ET.hitstopBoss);                 // freeze (roadmap #5)
  juice?.slowmo(ET.slowmoBossTime, ET.slowmoScale); // cinematic slow-mo (roadmap #10)
  audio?.bossHit();
  // drop Big capsules to refuel the next phase (GDD §5.3) — dropCapsule lifts any
  // that would land inside the arena mesh so they're always collectable.
  const drops = 3;
  for (let i = 0; i < drops; i++) {
    world.dropCapsule(b.x + b.w / 2 + rrange(-140, 140), b.y + b.h + rrange(40, 120), true);
  }
  if (b.armor <= 0) {
    b.alive = false; b.dead = true;
    // clear incoming fire on the kill
    world.projectiles = world.projectiles.filter((p) => p.from !== 'boss');
    juice?.bossDeath(b.x + b.w / 2, b.y + b.h / 2);
    audio?.bossDeath();
  }
};


// ── skills.js ──────────────────────────────────────────────
// skills.js — Skill 1 (Plasma Beam) and Skill 2 (Radial Discharge), both
// charge-on-hold / fire-on-release. Effects are written onto the world
// (world.beamBlast, world.radial, world.projectiles) for render + per-frame
// resolution. Boss interaction is delegated to enemies.bossTakeMaxHit.


const ST = TUNING;

class Skills {
  volt-flickeror() { this.reset(); }
  reset() {
    this.beamCharge = 0; this.beamHeldPrev = false; this.beamActive = false;
    this.radialCharge = 0; this.radialHeldPrev = false; this.radialActive = false;
  }

  // input: { beamHeld, radialHeld }; ctx: { player, world, juice, audio, view:{w,h} }
  update(dt, input, ctx) {
    const { player } = ctx;
    if (!player.alive) { this.beamCharge = 0; this.radialCharge = 0; return; }

    // ── Beam (Skill 1) ──
    if (input.beamHeld && player.volt > 0) {
      if (!this.beamHeldPrev) { this.beamCharge = 0; ctx.audio?.beamCharge(); }
      this.beamCharge = Math.min(ST.beamMaxHold, this.beamCharge + dt);
      this.beamActive = true;
    } else if (this.beamHeldPrev) {
      this._fireBeam(ctx);
      this.beamCharge = 0; this.beamActive = false;
    }
    this.beamHeldPrev = input.beamHeld && player.volt > 0;

    // ── Radial (Skill 2) ──
    if (input.radialHeld && player.volt > 0) {
      if (!this.radialHeldPrev) { this.radialCharge = 0; }
      this.radialCharge = Math.min(ST.radialMaxHold, this.radialCharge + dt);
      this.radialActive = true;
    } else if (this.radialHeldPrev) {
      this._fireRadial(ctx);
      this.radialCharge = 0; this.radialActive = false;
    }
    this.radialHeldPrev = input.radialHeld && player.volt > 0;
  }

  _fireBeam(ctx) {
    const { player, world, juice, audio, view } = ctx;
    const charge = this.beamCharge;
    // Deadzone: a brief accidental click fires NOTHING. The beam only fires on
    // release of a deliberate press; there is no separate traveling "tap bullet".
    if (charge < ST.beamDeadzone) return;
    // single charge-scaled hitscan beam (fires on release only)
    const frac = clamp((charge - ST.beamDeadzone) / (ST.beamMaxHold - ST.beamDeadzone), 0, 1);
    const isMax = charge >= ST.beamMaxHold - 0.01;
    const cost = isMax ? ST.costBeamMax : lerp(ST.costBeamTap, ST.costBeamMax, frac);
    if (!player.canSpend(Math.min(cost, 0.0001))) return; // need some volt to fire
    const thick = isMax ? view.h * ST.beamMaxThick : lerp(ST.beamChargeThickMin, ST.beamChargeThickMax, frac);
    const dmg = isMax ? ST.beamMaxDmg : lerp(ST.beamTapDmg, ST.beamMaxDmg * 0.5, frac);
    const dir = player.facing;
    const x0 = player.cx, yC = player.cy;
    const reach = isMax ? view.w : lerp(300, view.w, frac);

    // stop at first solid wall in the beam's path
    let len = reach;
    for (const s of world.solids()) {
      const t = rayRect(x0, yC, dir, 0, s, reach);
      if (t < len) len = t;
    }
    const band = { x: dir > 0 ? x0 : x0 - len, y: yC - thick / 2, w: len, h: thick };
    // damage band is slightly TALLER than the visible beam so its full width
    // connects (overpowered feel) — not just the bright core.
    const pad = ST.beamDmgPad;
    const dband = { x: band.x, y: yC - thick / 2 - pad, w: len, h: thick + pad * 2 };
    // apply damage. Enemies aren't solid → the band overlaps them directly. A
    // breakable IS solid, so it STOPS the beam and the band ends exactly at its
    // face (no overlap) — damage it by ray-distance instead: the wall the beam
    // hit sits at t ≈ len.
    let killed = false;
    for (const e of world.enemies) if (e.alive && aabbOverlap(dband, e)) { if (world.damageEnemy(e, dmg, 'beam')) killed = true; }
    for (const b of world.breakables) { if (!b.alive) continue; const tb = rayRect(x0, yC, dir, 0, b, reach); if (tb <= len + 1) world.damageBreakable(b, dmg); }
    if (isMax && world.boss && aabbOverlap(dband, world.boss)) bossTakeMaxHit(world, juice, audio);
    if (killed && isMax) juice?.hitstop(ST.hitstopKill); // hitstop on a Max Power kill (roadmap #5)

    // spend AFTER firing so a max shot at <=50% Volt is fatal (GDD warning)
    player.spend(cost);
    world.beamBlast = { x: band.x, y: band.y, w: band.w, h: band.h, dir, life: isMax ? ST.beamMaxDuration : 0.18, maxLife: isMax ? ST.beamMaxDuration : 0.18, max: isMax };
    // RECOIL DRIVE (feature #3): the shot blasts the player backward (opposite
    // the beam) with force scaling on charge — a Max Power shot is a beam-jump.
    const recoil = isMax ? ST.recoilBeamMax : lerp(ST.recoilBeamMin, ST.recoilBeamMax, frac);
    player.vx -= dir * recoil;
    player.vy -= recoil * ST.recoilBeamLift;
    juice?.kick(isMax ? ST.shakeBeamMax : ST.shakeBeamTap * (1 + frac));
    juice?.beamBurst(dir > 0 ? band.x + len : band.x, yC, isMax);
    audio?.beamFire(isMax);
  }

  _fireRadial(ctx) {
    const { player, world, juice, audio } = ctx;
    const charge = this.radialCharge;
    const frac = clamp(charge / ST.radialMaxHold, 0, 1);
    const isBig = frac > 0.25;
    const cost = isBig ? lerp(ST.costRadialTap, ST.costRadialMax, frac) : ST.costRadialTap;
    if (!player.canSpend(Math.min(cost, 0.0001))) return;
    player.spend(cost);
    const maxR = isBig ? lerp(ST.radialTapRadius * 2, Math.max(world.w, world.h), frac) : ST.radialTapRadius;
    world.radial = {
      x: player.cx, y: player.cy, r: 0, maxR,
      life: isBig ? ST.radialMaxDuration : 0.28, maxLife: isBig ? ST.radialMaxDuration : 0.28,
      dmg: isBig ? ST.radialDmgMax : ST.radialTapDmg, big: isBig, hit: new Set()
    };
    // RECOIL DRIVE (feature #3): a charged radial is omnidirectional, so it pops
    // the player straight up — a discharge-jump for reaching height.
    if (isBig) player.vy -= ST.recoilRadial * frac;
    juice?.kick(isBig ? ST.shakeBeamMax : ST.shakeBeamTap);
    audio?.radial(isBig);
  }
}

// Grow + resolve the active radial pulse each frame (passes through walls).
const updateRadial = (world, juice) => {
  const r = world.radial;
  if (!r) return;
  r.life -= world._lastDt || 0.016;
  const p = 1 - clamp(r.life / r.maxLife, 0, 1);
  r.r = r.maxR * Math.sqrt(p);
  const within = (o) => {
    const ox = o.x + (o.w || 0) / 2, oy = o.y + (o.h || 0) / 2;
    return Math.hypot(ox - r.x, oy - r.y) <= r.r;
  };
  for (const sw of world.switches) if (!sw.on && within({ x: sw.x, y: sw.y })) { world.triggerSwitch(sw); juice?.switchSpark(sw.x, sw.y); }
  for (const t of world.traps) if (r.big && t.armed && within(t)) { t.armed = false; juice?.trapDetonate(t.x + t.w / 2, t.y + t.h / 2); }
  for (const e of world.enemies) if (e.alive && !r.hit.has(e) && within(e)) { r.hit.add(e); if (e.shield) e.shield = false; world.damageEnemy(e, r.dmg, 'radial'); }
  for (const b of world.breakables) if (b.alive && !r.hit.has(b) && within(b)) { r.hit.add(b); world.damageBreakable(b, r.dmg); }
  if (r.life <= 0) world.radial = null;
};

// Tick down the beam blast visual.
const updateBeamBlast = (world, dt) => {
  if (!world.beamBlast) return;
  world.beamBlast.life -= dt;
  if (world.beamBlast.life <= 0) world.beamBlast = null;
};


// ── juice.js ──────────────────────────────────────────────
// juice.js — particles + a DELIBERATELY SUBTLE screen-shake (earlier build was
// "abnormally strong"; capped hard here). Electric, capsule, explosion and boss
// bursts; a brief flash on big events. No constant tremble.


const JC = TUNING.col;

class Juice {
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


// ── audio.js ──────────────────────────────────────────────
// audio.js — fully procedural WebAudio (no asset files). One-shot electric SFX
// for movement + both skills + combat. Lazily created on first gesture.

class Audio2 {
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


// ── render.js ──────────────────────────────────────────────
// render.js — Canvas2D. Camera follows the player; the world is drawn in world
// space (scaled to a VIEW_H-tall window → resolution independent). Dark low-poly
// shard field, electric Volt-driven player ball with procedural arcs, enemies,
// boss, skills FX, and textless tutorial silhouettes.


const RC = TUNING.col;
let _shards = null, _shardLevel = -1;
let _bloomC = null, _bloomCtx = null;

// Bloom (roadmap #8): downsample the frame, blur it, add it back so bright /
// additive areas (arcs, beams, capsules) glow. Canvas2D path — robust and cheap
// at bloomScale res; doubles as the WebGL fallback.
const applyBloom = (ctx) => {
  if (!TUNING.bloom) return;
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const ow = Math.max(1, Math.round(cw * TUNING.bloomScale)), oh = Math.max(1, Math.round(ch * TUNING.bloomScale));
  try {
    if (!_bloomC) { _bloomC = document.createElement('canvas'); _bloomCtx = _bloomC.getContext('2d'); }
    if (_bloomC.width !== ow || _bloomC.height !== oh) { _bloomC.width = ow; _bloomC.height = oh; }
    _bloomCtx.clearRect(0, 0, ow, oh);
    _bloomCtx.filter = `blur(${TUNING.bloomBlur}px)`;
    _bloomCtx.drawImage(ctx.canvas, 0, 0, ow, oh);
    _bloomCtx.filter = 'none';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = TUNING.bloomAlpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(_bloomC, 0, 0, cw, ch);
    ctx.restore();
  } catch { /* filter/drawImage unsupported → skip bloom */ }
};

// view: { scale, camX, camY, w, h } computed by game.js
const drawScene = (ctx, cssW, cssH, st) => {
  const { world, player, skills, juice, view, time, dpr } = st;
  const off = juice.offset();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // backdrop gradient (screen space)
  const g = ctx.createLinearGradient(0, 0, 0, cssH);
  g.addColorStop(0, RC.bg1); g.addColorStop(1, RC.bg0);
  ctx.fillStyle = g; ctx.fillRect(0, 0, cssW, cssH);

  ctx.save();
  ctx.translate(off.x, off.y);
  ctx.scale(view.scale, view.scale);
  ctx.translate(-view.camX, -view.camY);

  drawShards(ctx, world, time);
  drawPlatforms(ctx, world);
  drawBreakables(ctx, world);
  drawDoors(ctx, world);
  drawTraps(ctx, world, time);
  drawSwitches(ctx, world, time);
  drawCapsules(ctx, world, time);
  drawExit(ctx, world, time);
  drawEnemies(ctx, world, time);
  drawBoss(ctx, world, time);
  drawProjectiles(ctx, world);
  drawRadial(ctx, world);
  drawBeam(ctx, world);
  drawTutorial(ctx, world, time);
  drawPlayer(ctx, player, skills, time);
  drawParticles(ctx, juice);
  drawLabels(ctx, juice);

  ctx.restore();

  applyBloom(ctx); // roadmap #8

  // flash overlay (screen space)
  if (juice.flash > 0) {
    ctx.globalAlpha = clamp(juice.flash, 0, 1) * 0.8;
    ctx.fillStyle = juice.flashCol; ctx.fillRect(0, 0, cssW, cssH);
    ctx.globalAlpha = 1;
  }
};

const drawShards = (ctx, world, time) => {
  if (_shardLevel !== world.level?.id) {
    _shardLevel = world.level?.id; _shards = [];
    let seed = 1337;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const n = Math.round((world.w * world.h) / 90000);
    for (let i = 0; i < n; i++) {
      const x = rnd() * world.w, y = rnd() * world.h, s = 20 + rnd() * 70, a = rnd() * TAU;
      _shards.push({ x, y, s, a, d: 0.5 + rnd() * 0.5 });
    }
  }
  for (const sh of _shards) {
    ctx.save();
    ctx.translate(sh.x, sh.y); ctx.rotate(sh.a + Math.sin(time * 0.2 + sh.x) * 0.04);
    ctx.fillStyle = RC.shardDark; ctx.globalAlpha = 0.5 * sh.d;
    ctx.beginPath(); ctx.moveTo(0, -sh.s); ctx.lineTo(sh.s * 0.7, sh.s * 0.5); ctx.lineTo(-sh.s * 0.6, sh.s * 0.4); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.12 * sh.d; ctx.strokeStyle = RC.shardEdge; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
};

const drawPlatforms = (ctx, world) => {
  for (const p of world.platforms) {
    const big = p.w > 600 || p.h > 400;
    ctx.fillStyle = big ? RC.ground : RC.platform;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = big ? RC.groundEdge : RC.platformEdge;
    ctx.fillRect(p.x, p.y, p.w, 3);
    if (p.wall) { ctx.fillStyle = RC.platformEdge; ctx.globalAlpha = 0.5; ctx.fillRect(p.x, p.y, 3, p.h); ctx.fillRect(p.x + p.w - 3, p.y, 3, p.h); ctx.globalAlpha = 1; }
  }
  // blockers: translucent, dashed — hints "radial passes through"
  for (const b of world.blockers) {
    ctx.fillStyle = 'rgba(120,150,220,0.18)'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(150,180,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2); ctx.setLineDash([]);
  }
};

const drawDoors = (ctx, world) => {
  for (const d of world.doors) {
    if (d.open) continue;
    ctx.fillStyle = RC.door; ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.strokeStyle = RC.doorEdge; ctx.lineWidth = 2; ctx.strokeRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2);
  }
};

const drawBreakables = (ctx, world) => {
  for (const b of world.breakables) {
    if (!b.alive) continue;
    const frac = 1 - b.hp / b.maxHp; // 0 = intact, 1 = about to break
    ctx.fillStyle = b.hitFlash > 0 ? '#ffffff' : '#3a3320';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#6b5a32'; ctx.fillRect(b.x, b.y, b.w, 3); ctx.fillRect(b.x, b.y, 3, b.h);
    // crack lines grow with damage
    ctx.strokeStyle = `rgba(255,210,140,${0.25 + frac * 0.6})`; ctx.lineWidth = 1 + frac * 2;
    ctx.beginPath();
    ctx.moveTo(b.x + b.w * 0.2, b.y); ctx.lineTo(b.x + b.w * 0.5, b.y + b.h * 0.6); ctx.lineTo(b.x + b.w * 0.35, b.y + b.h);
    ctx.moveTo(b.x + b.w * 0.7, b.y); ctx.lineTo(b.x + b.w * 0.55, b.y + b.h * 0.5); ctx.lineTo(b.x + b.w * 0.8, b.y + b.h);
    ctx.stroke();
    // "shoot me" hint pips
    ctx.fillStyle = `rgba(255,180,80,${0.5 + frac * 0.4})`;
    ctx.fillRect(b.x + b.w / 2 - 2, b.y + b.h / 2 - 2, 4, 4);
  }
};

const drawTraps = (ctx, world, time) => {
  for (const t of world.traps) {
    const arm = t.armed;
    ctx.fillStyle = arm ? RC.trap : 'rgba(90,70,80,0.5)';
    ctx.globalAlpha = arm ? (0.7 + 0.3 * Math.sin(time * 8)) : 0.4;
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.globalAlpha = 1;
    if (arm) { ctx.strokeStyle = RC.trapArmed; ctx.lineWidth = 2; ctx.strokeRect(t.x, t.y, t.w, t.h); }
  }
};

const drawSwitches = (ctx, world, time) => {
  for (const s of world.switches) {
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = s.on ? 'rgba(86,224,160,0.4)' : 'rgba(91,107,134,0.25)';
    ctx.beginPath(); ctx.arc(0, 0, 22 + (s.on ? Math.sin(time * 6) * 3 : 0), 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = s.on ? RC.switchOn : RC.switchOff;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
    ctx.restore();
  }
};

const drawCapsules = (ctx, world, time) => {
  for (const c of world.capsules) {
    if (c.taken) continue;
    const cx = c.x, cy = c.y + Math.sin(c.bob * 2.5) * 5;
    const col = c.big ? RC.capsuleB : RC.capsuleS;
    ctx.save(); ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(0, 0, c.w, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = col;
    const r = c.w * 0.5;
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.85;
    ctx.fillRect(-2, -r * 0.5, 4, r); ctx.fillRect(-r * 0.5, -2, r, 4);
    ctx.globalAlpha = 1; ctx.restore();
  }
};

const drawExit = (ctx, world, time) => {
  const e = world.exit; if (!e) return;
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    ctx.strokeStyle = `rgba(127,216,255,${0.5 - k * 0.13})`;
    ctx.lineWidth = 3;
    const r = (e.w * 0.4) + k * 8 + Math.sin(time * 3 + k) * 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(174,242,255,0.9)';
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill();
  ctx.restore();
};

const drawEnemies = (ctx, world, time) => {
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    ctx.save(); ctx.translate(cx, cy);
    const flash = e.hitFlash > 0;
    ctx.fillStyle = flash ? '#ffffff' : (e.type === 'tank' ? RC.boss : (e.type === 'shooter' ? RC.enemy2 : (e.type === 'shielded' ? '#6a86c8' : RC.enemy)));
    ctx.strokeStyle = RC.enemyEdge; ctx.lineWidth = 2;
    if (e.type === 'float' || e.type === 'shielded') {
      ctx.beginPath(); ctx.moveTo(0, -e.h / 2); ctx.lineTo(e.w / 2, e.h / 2); ctx.lineTo(-e.w / 2, e.h / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (e.type === 'shooter') {
      // armored octagon turret with a pulsing red core
      const r = e.w / 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; const px = Math.cos(a) * r, py = Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = flash ? '#ffffff' : RC.bossCore;
      ctx.beginPath(); ctx.arc(0, 0, e.w * 0.2, 0, TAU); ctx.fill();
    } else if (e.type === 'relay') {
      // shield-generator station — hexagon with a pulsing blue core
      const r = e.w / 2;
      ctx.fillStyle = flash ? '#ffffff' : '#27406e';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; const px = Math.cos(a) * r, py = Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#7fd8ff'; ctx.globalAlpha = 0.4 + 0.4 * Math.sin(time * 6 + e.phase);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    } else if (e.type === 'charger') {
      // aggressive arrowhead pointing in its charge direction
      const d = e.dir || 1, r = e.w / 2;
      ctx.fillStyle = flash ? '#ffffff' : RC.enemy2;
      ctx.beginPath(); ctx.moveTo(d * r, 0); ctx.lineTo(-d * r, -e.h / 2); ctx.lineTo(-d * r * 0.4, 0); ctx.lineTo(-d * r, e.h / 2); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else {
      ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h); ctx.strokeRect(-e.w / 2, -e.h / 2, e.w, e.h);
      if (e.type === 'tank') {
        ctx.fillStyle = RC.bossCore; ctx.beginPath(); ctx.arc(0, 0, e.w * 0.18, 0, TAU); ctx.fill();
      }
    }
    // shield bubble — beam-proof until a Radial pops it
    if (e.shield) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(120,200,255,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, e.w * 0.85, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.18; ctx.fillStyle = '#7fd8ff';
      ctx.beginPath(); ctx.arc(0, 0, e.w * 0.85, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    if (e.maxHp > 40 && e.hp < e.maxHp) { // hp bar for tanks
      const w = e.w, frac = e.hp / e.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x, e.y - 10, w, 5);
      ctx.fillStyle = RC.trap; ctx.fillRect(e.x, e.y - 10, w * frac, 5);
    }
  }
};

const drawBoss = (ctx, world, time) => {
  const b = world.boss; if (!b || !b.alive) return;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  // DIVE-LANE telegraph (diver/overlord wind-up): warn the locked charge height
  if (b.state === 'wind' && b.diveY != null) {
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.22 * Math.abs(Math.sin(time * 22));
    ctx.fillStyle = RC.trap;
    ctx.fillRect(0, b.diveY, world.w, b.h);
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ff5c7a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, b.diveY); ctx.lineTo(world.w, b.diveY);
    ctx.moveTo(0, b.diveY + b.h); ctx.lineTo(world.w, b.diveY + b.h); ctx.stroke();
    ctx.restore();
  }
  // shield generator links + bubble (tier ≥ 3) — destroy the relays to drop it
  if (b.shielded) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const e of world.enemies) {
      if (e.type !== 'relay' || !e.alive) continue;
      ctx.strokeStyle = 'rgba(127,216,255,0.5)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(e.x + e.w / 2, e.y + e.h / 2); ctx.stroke();
    }
    const pr = 0.5 + 0.5 * Math.sin(time * 5);
    ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = 4; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(cx, cy, b.w * 0.85 + pr * 6, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.12; ctx.fillStyle = '#7fd8ff';
    ctx.beginPath(); ctx.arc(cx, cy, b.w * 0.85, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = b.hitFlash > 0.5 ? '#ffffff' : RC.boss;
  ctx.strokeStyle = RC.bossEdge; ctx.lineWidth = 3;
  // angular hull
  ctx.beginPath();
  ctx.moveTo(0, -b.h / 2); ctx.lineTo(b.w / 2, -b.h * 0.1); ctx.lineTo(b.w * 0.35, b.h / 2);
  ctx.lineTo(-b.w * 0.35, b.h / 2); ctx.lineTo(-b.w / 2, -b.h * 0.1); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // core
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = RC.bossCore; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 5);
  ctx.beginPath(); ctx.arc(0, 0, b.w * 0.12, 0, TAU); ctx.fill();
  // TELEGRAPH wind-up flash before a volley (roadmap #10)
  if (b.telegraph > 0) {
    const tw = 1 - b.telegraph / TUNING.bossTelegraph; // 0→1 as it winds up
    ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 30));
    ctx.fillStyle = '#fff0a0';
    ctx.beginPath(); ctx.arc(0, b.h * 0.4, b.w * (0.14 + tw * 0.22), 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, b.w * 0.5 * (1 - tw) + 6, 0, TAU); ctx.stroke();
  }
  ctx.restore();
  // armor pips
  for (let i = 0; i < b.maxArmor; i++) {
    ctx.fillStyle = i < b.armor ? RC.bossCore : 'rgba(120,140,200,0.3)';
    ctx.fillRect(b.x + 10 + i * 22, b.y - 16, 16, 8);
  }
};

const drawProjectiles = (ctx, world) => {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const p of world.projectiles) {
    const col = p.from === 'boss' ? RC.trap : RC.beam;
    ctx.fillStyle = col; ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.8, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = p.from === 'boss' ? '#ffd0d0' : '#ffffff';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.7, 0, TAU); ctx.fill();
  }
  ctx.restore();
};

const drawBeam = (ctx, world) => {
  const b = world.beamBlast; if (!b) return;
  const a = clamp(b.life / b.maxLife, 0, 1);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a * 0.25; ctx.fillStyle = RC.beam;
  ctx.fillRect(b.x, b.y - 6, b.w, b.h + 12);
  ctx.globalAlpha = a * 0.7; ctx.fillStyle = RC.beamMax;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.globalAlpha = a; ctx.fillStyle = RC.beamHot;
  ctx.fillRect(b.x, b.y + b.h * 0.5 - Math.max(2, b.h * 0.12), b.w, Math.max(4, b.h * 0.24));
  ctx.restore();
};

const drawRadial = (ctx, world) => {
  const r = world.radial; if (!r) return;
  const a = clamp(r.life / r.maxLife, 0, 1);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = r.big ? RC.radial : RC.beam; ctx.lineWidth = r.big ? 10 : 6; ctx.globalAlpha = a * 0.9;
  ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
  ctx.globalAlpha = a * 0.3; ctx.lineWidth = r.big ? 26 : 14;
  ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
  ctx.restore();
};

const drawPlayer = (ctx, p, skills, time) => {
  if (!p.alive) return;
  const vf = p.voltFrac;
  const cx = p.cx, cy = p.cy;
  const baseR = p.w * 0.46 * (0.6 + 0.4 * vf);
  // color by volt: yellow(hi) → cyan(mid) → dull(lo); OVERPOWERED = blinding yellow-white
  const col = p.over ? '#fff6c0' : (vf > 0.5 ? mix(RC.voltMid, RC.voltHi, (vf - 0.5) * 2) : mix(RC.voltLo, RC.voltMid, vf * 2));
  const blink = p.invuln > 0 && Math.floor(time * 20) % 2 === 0;
  // ── OVERPOWERED hyper aura (roadmap #20) — high-fidelity, attention-grabbing ──
  if (p.over) {
    const hb = 0.5 + 0.5 * Math.sin(time * 42);            // hyper blink
    ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#fff2a0'; ctx.globalAlpha = 0.30 + 0.45 * hb;
    ctx.beginPath(); ctx.arc(0, 0, baseR * (3.4 + hb * 1.2), 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffe23a'; ctx.lineWidth = 3 + hb * 5; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(0, 0, baseR * 2.5, 0, TAU); ctx.stroke();
    // jagged hyper arcs shooting out
    ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.7 + 0.3 * hb;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + rng() * 0.6, len = baseR * (3 + rng() * 2.5);
      ctx.lineWidth = 1.5 + rng() * 2; ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * len * 0.5 + (rng() - 0.5) * 14, Math.sin(a) * len * 0.5 + (rng() - 0.5) * 14);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.stroke();
    }
    ctx.restore();
  }

  // dash trail
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const t of p.trail) { ctx.globalAlpha = clamp(t.a, 0, 1) * 0.5; ctx.fillStyle = RC.arc; ctx.beginPath(); ctx.arc(t.x, t.y, baseR * 0.8, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.restore();

  if (blink) return;

  ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = 'lighter';
  // outer glow
  ctx.fillStyle = col; ctx.globalAlpha = 0.25 + 0.25 * vf;
  ctx.beginPath(); ctx.arc(0, 0, baseR * (2.0 + vf), 0, TAU); ctx.fill();
  // arcs (more/longer/brighter with volt)
  const arcs = 4 + Math.round(vf * 8);
  ctx.strokeStyle = RC.arc; ctx.globalAlpha = 0.5 + 0.4 * vf;
  for (let i = 0; i < arcs; i++) {
    const a = (i / arcs) * TAU + rng() * 0.5;
    const len = baseR * (1.6 + vf * 2.2) * (0.6 + rng() * 0.8);
    ctx.lineWidth = 1 + rng() * 1.5; ctx.beginPath();
    let ax = 0, ay = 0; ctx.moveTo(0, 0);
    const segs = 3;
    for (let k = 1; k <= segs; k++) {
      const t = k / segs;
      ax = Math.cos(a) * len * t + (rng() - 0.5) * 10;
      ay = Math.sin(a) * len * t + (rng() - 0.5) * 10;
      ctx.lineTo(ax, ay);
    }
    ctx.stroke();
  }
  // charge ring (beam)
  if (skills && skills.beamActive) {
    const cf = clamp(skills.beamCharge / TUNING.beamMaxHold, 0, 1);
    ctx.globalAlpha = 0.9; ctx.strokeStyle = cf >= 0.99 ? RC.beamHot : RC.beam; ctx.lineWidth = 3 + cf * 4;
    ctx.beginPath(); ctx.arc(0, 0, baseR * 1.6, -Math.PI / 2, -Math.PI / 2 + cf * TAU); ctx.stroke();
  }
  if (skills && skills.radialActive) {
    const rf = clamp(skills.radialCharge / TUNING.radialMaxHold, 0, 1);
    ctx.globalAlpha = 0.5; ctx.strokeStyle = RC.radial; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, baseR + rf * 120, 0, TAU); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  // core ball
  ctx.globalAlpha = 1; ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : col;
  ctx.beginPath(); ctx.arc(0, 0, baseR, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.7 * (0.4 + vf * 0.6);
  ctx.beginPath(); ctx.arc(-baseR * 0.25, -baseR * 0.25, baseR * 0.4, 0, TAU); ctx.fill();
  ctx.restore();
};

const drawTutorial = (ctx, world, time) => {
  const pulse = 0.5 + 0.5 * Math.sin(time * 3);
  for (const tut of world.tutorial) {
    ctx.save(); ctx.translate(tut.x, tut.y);
    ctx.globalAlpha = 0.5 + pulse * 0.4;
    // mouse body
    ctx.strokeStyle = RC.text; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(20,30,60,0.6)';
    roundRect(ctx, -22, -34, 44, 64, 20); ctx.fill();
    // highlighted button — CLIPPED to the mouse shape so it follows the rounded top
    const left = tut.skill === 'beam';
    ctx.save();
    roundRect(ctx, -22, -34, 44, 64, 20); ctx.clip();
    ctx.fillStyle = pulse > 0.5 ? RC.voltHi : RC.beam; ctx.globalAlpha = 0.45 + pulse * 0.45;
    ctx.fillRect(left ? -22 : 0, -34, 22, 32);
    ctx.restore();
    // outline + button seams on top
    ctx.globalAlpha = 0.5 + pulse * 0.4;
    roundRect(ctx, -22, -34, 44, 64, 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, -2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-22, -2); ctx.lineTo(22, -2); ctx.stroke();
    // hold/explosion hint
    ctx.globalAlpha = 0.6 + pulse * 0.3; ctx.fillStyle = RC.text;
    ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(left ? 'HOLD' : 'TAP', 0, 56);
    // boom / through-wall glyph
    ctx.strokeStyle = left ? RC.voltHi : RC.radial; ctx.lineWidth = 3; ctx.globalAlpha = 0.4 + pulse * 0.5;
    ctx.beginPath(); ctx.arc(70, 0, 16 + pulse * 8, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
};

const drawLabels = (ctx, juice) => {
  if (!juice.labels || !juice.labels.length) return;
  ctx.save(); ctx.textAlign = 'center';
  for (const l of juice.labels) {
    const a = clamp(l.life / l.maxLife, 0, 1);
    const dx = Math.sin(l.wob) * 6; // wobble
    ctx.globalAlpha = a;
    ctx.font = `900 ${l.size}px sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(l.text, l.x + dx, l.y);
    ctx.fillStyle = l.color; ctx.fillText(l.text, l.x + dx, l.y);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.restore();
};

const drawParticles = (ctx, juice) => {
  ctx.save();
  juice.particles.forEach((q) => {
    const a = clamp(q.life / q.maxLife, 0, 1);
    ctx.globalCompositeOperation = q.additive ? 'lighter' : 'source-over';
    ctx.globalAlpha = a; ctx.fillStyle = q.color;
    ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  });
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
};

// ── helpers ──
const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => { t = clamp(t, 0, 1); const A = hex(a), B = hex(b); return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; };


// ── ui.js ──────────────────────────────────────────────
// ui.js — DOM overlay over the canvas. VOLT header (bar 0–100 + %), level name,
// pause/levels, mute; touch controls (move pad + JUMP / DASH / BEAM-hold /
// BURST-hold); transient overlays + a level-select modal. All vw/vh/clamp +
// safe-area → fully responsive. game.js wires the callbacks.

const CSS = `
.vf-ui,.vf-ui *{box-sizing:border-box;font-family:'Segoe UI',system-ui,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none}
.vf-ui{position:fixed;inset:0;pointer-events:none;z-index:2147483600;color:#dff1ff}
.vf-ui button{pointer-events:auto;cursor:pointer;color:inherit;font:inherit}
.vf-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:1.6vmin;
  padding:calc(1.2vmin + env(safe-area-inset-top)) calc(2vmin + env(safe-area-inset-right)) 1.2vmin calc(2vmin + env(safe-area-inset-left))}
.vf-icn{pointer-events:auto;width:clamp(36px,6.5vmin,52px);height:clamp(36px,6.5vmin,52px);border-radius:14%;
  display:flex;align-items:center;justify-content:center;background:rgba(10,18,40,.6);border:2px solid #7fd8ff;
  box-shadow:0 0 12px rgba(127,216,255,.4);color:#7fd8ff;font-size:clamp(15px,3.2vmin,24px)}
.vf-icn:active{transform:scale(.9)}
.vf-center{flex:1;display:flex;flex-direction:column;gap:.6vmin;min-width:0}
.vf-row{display:flex;align-items:center;gap:1.2vmin}
.vf-name{font-weight:800;letter-spacing:.2em;text-transform:uppercase;font-size:clamp(11px,2.3vmin,18px);color:#9fe6ff;
  text-shadow:0 0 8px rgba(127,216,255,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vf-volt{font-weight:900;font-size:clamp(12px,2.6vmin,20px);color:#ffe23a;text-shadow:0 0 8px rgba(255,226,58,.6);min-width:3.5em;text-align:right}
.vf-bar{flex:1;height:clamp(10px,1.8vmin,16px);border-radius:99px;background:rgba(8,16,34,.8);
  border:1px solid rgba(127,216,255,.5);overflow:hidden;box-shadow:inset 0 0 6px rgba(0,0,0,.6)}
.vf-fill{height:100%;width:100%;border-radius:99px;transition:width .12s linear,background .2s}
.vf-bar.debt{border-color:#ff3b4e;box-shadow:0 0 12px rgba(255,59,78,.8),inset 0 0 6px rgba(255,59,78,.5);animation:vfDebt .5s ease-in-out infinite}
@keyframes vfDebt{0%,100%{opacity:.55}50%{opacity:1}}
.vf-bar.over{border-color:#ffe23a;box-shadow:0 0 16px rgba(255,226,58,.95),inset 0 0 8px rgba(255,226,58,.6);animation:vfOver .3s ease-in-out infinite}
@keyframes vfOver{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.02)}}
.vf-msg{position:absolute;left:0;right:0;top:42%;transform:translateY(-50%);text-align:center;pointer-events:none;
  display:flex;flex-direction:column;align-items:center;gap:1.4vmin;padding:0 5vw}
.vf-msg .big{font-weight:900;letter-spacing:.12em;text-transform:uppercase;font-size:clamp(28px,8vmin,72px);text-shadow:0 0 18px rgba(127,216,255,.8),0 4px 0 rgba(0,0,0,.5)}
.vf-msg .sub{font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-size:clamp(12px,3vmin,22px);color:#9fe6ff;opacity:.9;animation:vfP 1.3s ease-in-out infinite}
.vf-msg .win{color:#aef2ff}.vf-msg .lose{color:#ff7a8a}
@keyframes vfP{0%,100%{opacity:.4}50%{opacity:1}}
.vf-acts{display:flex;gap:1.8vmin;pointer-events:auto;margin-top:1vmin;flex-wrap:wrap;justify-content:center}
.vf-btn{pointer-events:auto;padding:1.3vmin 3.4vmin;border-radius:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  font-size:clamp(13px,2.8vmin,20px);background:linear-gradient(180deg,#7fd8ff,#2f8fd0);color:#04121f;border:2px solid #cdeeff;box-shadow:0 0 16px rgba(127,216,255,.6)}
.vf-btn:active{transform:scale(.94)}.vf-btn.alt{background:linear-gradient(180deg,#2a3450,#161d2e);color:#cfe6ff;border-color:#3b557a}
.vf-ui.vf-no-touch .vf-controls{display:none}
.vf-keymap{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(2vmin + env(safe-area-inset-bottom));
  display:flex;gap:1.4vmin;align-items:flex-end;justify-content:center;flex-wrap:wrap;pointer-events:none;max-width:96vw;
  background:rgba(6,12,24,.55);border:1px solid rgba(127,216,255,.28);border-radius:12px;padding:1vmin 1.6vmin}
.vf-keymap.hide{display:none}
.vf-km{display:flex;flex-direction:column;align-items:center;gap:.5vmin}
.vf-km .lbl{font-size:clamp(7px,1.4vmin,10px);letter-spacing:.08em;text-transform:uppercase;color:#9fc0d8;white-space:nowrap}
.vf-km .keys{display:flex;gap:.4vmin;align-items:center}
.vf-km .plus{color:#7fa0c0;font-weight:700;font-size:clamp(8px,1.6vmin,12px)}
.vf-cap{min-width:clamp(20px,4.2vmin,34px);height:clamp(20px,4.2vmin,34px);padding:0 .6vmin;border-radius:6px;
  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:clamp(8px,1.7vmin,13px);
  background:rgba(20,32,56,.92);border:2px solid #3b557a;color:#cfe6ff;box-shadow:0 2px 0 rgba(0,0,0,.4);transition:background .07s,border-color .07s,box-shadow .07s}
.vf-cap.on{background:#37d67a;border-color:#aef0c8;color:#04140a;box-shadow:0 0 12px rgba(55,214,122,.85)}
.vf-controls{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;align-items:flex-end;
  padding:calc(2vmin + env(safe-area-inset-left)) calc(2vmin + env(safe-area-inset-right)) calc(2.2vmin + env(safe-area-inset-bottom))}
.vf-pad{display:flex;gap:1.4vmin}
.vf-key{pointer-events:auto;width:clamp(50px,11vmin,80px);height:clamp(50px,11vmin,80px);border-radius:18%;display:flex;align-items:center;justify-content:center;
  font-size:clamp(18px,4.2vmin,30px);font-weight:800;background:rgba(10,18,40,.5);border:2px solid rgba(127,216,255,.55);color:#bfe9ff;box-shadow:0 0 10px rgba(127,216,255,.25)}
.vf-key:active,.vf-key.on{transform:scale(.93);background:rgba(127,216,255,.22)}
.vf-right{display:grid;grid-template-columns:repeat(2,auto);gap:1.2vmin}
.vf-act{pointer-events:auto;width:clamp(56px,12vmin,88px);height:clamp(56px,12vmin,88px);border-radius:22%;display:flex;flex-direction:column;align-items:center;justify-content:center;
  font-weight:900;font-size:clamp(10px,2.1vmin,15px);letter-spacing:.04em;border:3px solid #d8f4ff;color:#04121f}
.vf-act:active{transform:scale(.92)}
.vf-jump{background:radial-gradient(circle at 50% 35%,#aef0ff,#3f9fd0)}
.vf-dash{background:radial-gradient(circle at 50% 35%,#c0a0ff,#6a3fd0);color:#0a0420;border-color:#e6d8ff}
.vf-beam{background:radial-gradient(circle at 50% 35%,#fff0a0,#d0a030);color:#1a1400;border-color:#fff3c8}
.vf-burst{background:radial-gradient(circle at 50% 35%,#b08bff,#7a3fd0);color:#0a0420;border-color:#e6d8ff}
.vf-modal{position:absolute;inset:0;background:rgba(4,8,18,.82);backdrop-filter:blur(6px);pointer-events:auto;display:none;
  flex-direction:column;align-items:center;justify-content:center;gap:3vmin;padding:calc(3vmin + env(safe-area-inset-top)) 4vw calc(3vmin + env(safe-area-inset-bottom))}
.vf-modal.open{display:flex}
.vf-modal h2{margin:0;font-weight:900;letter-spacing:.2em;text-transform:uppercase;font-size:clamp(22px,6vmin,44px);color:#9fe6ff;text-shadow:0 0 18px rgba(127,216,255,.8)}
.vf-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2.2vmin;width:min(92vw,560px)}
.vf-lvl{pointer-events:auto;aspect-ratio:1;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6vmin;
  background:rgba(10,18,40,.7);border:2px solid #7fd8ff;color:#d6f1ff;box-shadow:0 0 14px rgba(127,216,255,.35);font-weight:800}
.vf-lvl .n{font-size:clamp(22px,6vmin,40px)}.vf-lvl .nm{font-size:clamp(8px,1.7vmin,11px);letter-spacing:.06em;text-transform:uppercase;opacity:.8;text-align:center;padding:0 1vmin}
.vf-lvl.locked{opacity:.35;filter:grayscale(.7);border-color:#3b557a;box-shadow:none}
`;

class UI {
  volt-flickeror() { this.cb = {}; this.held = { left: false, right: false }; }

  mount(root, cb) {
    this.cb = cb || {};
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    // Touch devices keep the on-screen pad + skill buttons; desktop (fine pointer,
    // no touch) hides them — keyboard/mouse only.
    const isTouch = (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);
    const el = document.createElement('div'); el.className = 'vf-ui' + (isTouch ? '' : ' vf-no-touch'); el.innerHTML = `
      <div class="vf-top">
        <button class="vf-icn" data-act="levels" title="Levels">▦</button>
        <div class="vf-center">
          <div class="vf-name" data-id="name">LEVEL 1</div>
          <div class="vf-row"><div class="vf-bar"><div class="vf-fill" data-id="fill"></div></div><div class="vf-volt" data-id="volt">100%</div></div>
        </div>
        <button class="vf-icn" data-act="editor" title="Level Editor (F2)">✎</button>
        <button class="vf-icn" data-act="mute" title="Sound">♪</button>
        <button class="vf-icn" data-act="pause" title="Pause">⏸</button>
      </div>
      <div class="vf-msg" data-id="msg" style="display:none">
        <div class="big" data-id="msgbig"></div><div class="sub" data-id="msgsub"></div>
        <div class="vf-acts" data-id="acts"></div>
      </div>
      <div class="vf-controls">
        <div class="vf-pad">
          <button class="vf-key" data-pad="left">◀</button>
          <button class="vf-key" data-pad="right">▶</button>
        </div>
        <div class="vf-right">
          <button class="vf-act vf-beam" data-hold="beam">BEAM</button>
          <button class="vf-act vf-burst" data-hold="burst">BURST</button>
          <button class="vf-act vf-dash" data-tap="dash">DASH</button>
          <button class="vf-act vf-jump" data-tap="jump">JUMP</button>
        </div>
      </div>
      <div class="vf-keymap hide" data-id="keymap">
        <div class="vf-km"><div class="keys"><span class="vf-cap" data-k="left">A</span><span class="vf-cap" data-k="right">D</span></div><div class="lbl">Move</div></div>
        <div class="vf-km"><div class="keys"><span class="vf-cap" data-k="jump">Space</span></div><div class="lbl">Jump</div></div>
        <div class="vf-km"><div class="keys"><span class="vf-cap" data-k="dash">E</span></div><div class="lbl">Dash</div></div>
        <div class="vf-km"><div class="keys"><span class="vf-cap" data-k="beam">LMB</span><span class="plus">+</span><span class="vf-cap" data-k="beam">Shift</span></div><div class="lbl">Charge Shot</div></div>
        <div class="vf-km"><div class="keys"><span class="vf-cap" data-k="radial">RMB</span><span class="plus">+</span><span class="vf-cap" data-k="radial">Ctrl</span></div><div class="lbl">Discharge</div></div>
      </div>
      <div class="vf-modal" data-id="modal">
        <h2>Select Level</h2><div class="vf-grid" data-id="grid"></div>
        <button class="vf-btn alt" data-act="closeModal">Close</button>
      </div>`;
    root.appendChild(el);
    this.el = el; this.$ = (id) => el.querySelector(`[data-id="${id}"]`);

    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this._act(b.getAttribute('data-act')); }));
    el.querySelectorAll('[data-pad]').forEach((b) => {
      const dir = b.getAttribute('data-pad');
      const dn = (e) => { e.preventDefault(); e.stopPropagation(); this.held[dir] = true; b.classList.add('on'); this._move(); };
      const up = (e) => { e.stopPropagation(); this.held[dir] = false; b.classList.remove('on'); this._move(); };
      b.addEventListener('pointerdown', dn); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
    });
    el.querySelectorAll('[data-tap]').forEach((b) => {
      const act = b.getAttribute('data-tap');
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (act === 'jump') this.cb.jump && this.cb.jump(); else this.cb.dash && this.cb.dash(); });
    });
    el.querySelectorAll('[data-hold]').forEach((b) => {
      const which = b.getAttribute('data-hold');
      const dn = (e) => { e.preventDefault(); e.stopPropagation(); this.cb.hold && this.cb.hold(which, true); b.classList.add('on'); };
      const up = (e) => { e.stopPropagation(); this.cb.hold && this.cb.hold(which, false); b.classList.remove('on'); };
      b.addEventListener('pointerdown', dn); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
    });
  }

  _act(a) {
    if (a === 'levels' || a === 'pause') this.cb.openLevels && this.cb.openLevels();
    else if (a === 'closeModal') this.closeModal();
    else if (a === 'editor') this.cb.openEditor && this.cb.openEditor();
    else if (a === 'mute') this.cb.toggleMute && this.cb.toggleMute();
  }
  _move() { const d = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0); this.cb.move && this.cb.move(d); }

  update(m) {
    this.$('name').textContent = `LVL ${m.levelNum} · ${m.levelName}`;
    const v = m.volt;
    const f = this.$('fill'); f.style.width = `${Math.max(0, Math.min(100, v))}%`;
    const bar = this.el.querySelector('.vf-bar');
    const vt = this.$('volt');
    if (bar) { bar.classList.remove('debt'); bar.classList.remove('over'); }
    if (v < 0) {
      // VOLT DEBT (feature #4): borrowed power — bar empty + pulsing red overdraft
      f.style.background = '#ff3b4e';
      if (bar) bar.classList.add('debt');
      vt.textContent = `DEBT ${Math.ceil(v)}%`; vt.style.color = '#ff5b6a';
    } else if (v > 100) {
      // OVERCHARGE / OVERPOWERED (roadmap #20): lightning-yellow overextended bar
      f.style.background = 'linear-gradient(90deg,#ffd23c,#fff7c0,#ffe23a)';
      if (bar) bar.classList.add('over');
      vt.textContent = `${Math.ceil(v)}%${m.over ? ' ⚡' : ''}`; vt.style.color = '#fff2a0';
    } else {
      f.style.background = v <= 25 ? 'linear-gradient(90deg,#ff3b4e,#ff7a3c)' : v <= 55 ? 'linear-gradient(90deg,#7fd8ff,#ffe23a)' : 'linear-gradient(90deg,#7fd8ff,#aef2ff,#ffe23a)';
      vt.textContent = `${Math.ceil(v)}%`; vt.style.color = v <= 25 ? '#ff5b6a' : '#ffe23a';
    }
    const mb = this.el.querySelector('[data-act="mute"]'); if (mb) mb.textContent = m.muted ? '♪̸' : '♪';
  }

  showKeymap(show) { this.$('keymap').classList.toggle('hide', !show); }
  // map: { left, right, jump, dash, beam, radial } booleans → green key-caps
  setActive(map) {
    if (!this._caps) this._caps = [...this.el.querySelectorAll('.vf-cap[data-k]')];
    for (const c of this._caps) {
      const on = !!map[c.getAttribute('data-k')];
      if (c.classList.contains('on') !== on) c.classList.toggle('on', on);
    }
  }

  showMessage(big, sub, cls, actions) {
    const msg = this.$('msg');
    this.$('msgbig').textContent = big; this.$('msgbig').className = 'big ' + (cls || '');
    this.$('msgsub').textContent = sub || '';
    const ac = this.$('acts'); ac.innerHTML = '';
    (actions || []).forEach((a) => { const b = document.createElement('button'); b.className = 'vf-btn ' + (a.alt ? 'alt' : ''); b.textContent = a.label; b.addEventListener('click', (e) => { e.stopPropagation(); a.onClick(); }); ac.appendChild(b); });
    msg.style.display = 'flex';
  }
  hideMessage() { this.$('msg').style.display = 'none'; }

  openModal(levels, unlocked) {
    const grid = this.$('grid'); grid.innerHTML = '';
    levels.forEach((lv, i) => {
      const locked = i >= unlocked; const b = document.createElement('button');
      b.className = 'vf-lvl' + (locked ? ' locked' : '');
      b.innerHTML = `<div class="n">${i + 1}</div><div class="nm">${lv.name}</div>`;
      if (!locked) b.addEventListener('click', (e) => { e.stopPropagation(); this.closeModal(); this.cb.selectLevel && this.cb.selectLevel(i); });
      grid.appendChild(b);
    });
    this.$('modal').classList.add('open');
  }
  closeModal() { this.$('modal').classList.remove('open'); }
  isModalOpen() { return this.$('modal').classList.contains('open'); }
}


// ── editor.js ──────────────────────────────────────────────
// editor.js — in-game level editor (roadmap #19). Toggle with F2 (or the ✎ HUD
// button). Pick a tool from the palette, click/drag on the level to place,
// drag to move, Delete to remove. Save writes a per-level override to
// localStorage (the game loads it automatically) and copies the level JSON to
// the clipboard so you can paste it back into levels.js.
//
// It edits the LIVE world arrays, so changes are visible immediately. Gameplay
// is paused while the editor is open.


const TOOLS = [
  ['select', 'Select'], ['platform', 'Platform'], ['wall', 'Wall'], ['breakable', 'Breakable'],
  ['exit', 'Exit'], ['door', 'Door'], ['switch', 'Switch'], ['trap', 'Trap'], ['mover', 'Mover'],
  ['capS', 'Capsule'], ['capB', 'Big Cap'],
  ['patrol', 'Patrol'], ['float', 'Float'], ['charger', 'Charger'], ['shielded', 'Shielded'],
  ['shooter', 'Turret'], ['tank', 'Tank'], ['relay', 'Relay'], ['spawn', 'Spawn']
];

const ED_CSS = `
.ed-ui{position:fixed;inset:0;z-index:2147483640;pointer-events:none;font-family:system-ui,sans-serif;color:#dff1ff;display:none}
.ed-ui.on{display:block}
.ed-pal{position:absolute;top:0;left:0;bottom:0;width:148px;overflow:auto;background:rgba(6,12,24,.92);border-right:2px solid #1de0ff;
  pointer-events:auto;padding:8px;display:flex;flex-direction:column;gap:5px}
.ed-pal b{font-size:12px;color:#7fd8ff;letter-spacing:.1em;text-transform:uppercase}
.ed-tool{pointer-events:auto;cursor:pointer;border:1px solid #2b4790;background:#10193a;color:#cfe6ff;border-radius:6px;padding:6px 8px;font-size:12px;text-align:left}
.ed-tool.sel{background:#1de0ff;color:#04121f;border-color:#bff4ff;font-weight:800}
.ed-bar{position:absolute;top:8px;left:160px;display:flex;gap:6px;pointer-events:auto;flex-wrap:wrap}
.ed-btn{pointer-events:auto;cursor:pointer;border:2px solid #1de0ff;background:#0a1530;color:#cfe6ff;border-radius:8px;padding:6px 12px;font-weight:700;font-size:12px}
.ed-btn:active{transform:scale(.95)}
.ed-info{position:absolute;bottom:8px;left:160px;background:rgba(6,12,24,.8);border:1px solid #2b4790;border-radius:6px;padding:6px 10px;font-size:12px;color:#9fc0d8;pointer-events:none}
`;

class Editor {
  volt-flickeror(game) { this.game = game; this.enabled = false; this.tool = 'select'; this.sel = null; this.drag = null; this.grid = 10; }

  mount(root) {
    const style = document.createElement('style'); style.textContent = ED_CSS; document.head.appendChild(style);
    const el = document.createElement('div'); el.className = 'ed-ui';
    const pal = document.createElement('div'); pal.className = 'ed-pal';
    pal.innerHTML = '<b>Tools</b>';
    for (const [id, label] of TOOLS) {
      const b = document.createElement('button'); b.className = 'ed-tool'; b.textContent = label; b.dataset.tool = id;
      b.addEventListener('click', () => { this.tool = id; this._refreshTools(); });
      pal.appendChild(b);
    }
    const bar = document.createElement('div'); bar.className = 'ed-bar';
    const mkBtn = (label, fn) => { const b = document.createElement('button'); b.className = 'ed-btn'; b.textContent = label; b.addEventListener('click', fn); return b; };
    bar.appendChild(mkBtn('Save+Copy JSON', () => this.save()));
    bar.appendChild(mkBtn('Revert Level', () => this.revert()));
    bar.appendChild(mkBtn('Wider', () => this._resize(20, 0)));
    bar.appendChild(mkBtn('Narrower', () => this._resize(-20, 0)));
    bar.appendChild(mkBtn('Taller', () => this._resize(0, 20)));
    bar.appendChild(mkBtn('Shorter', () => this._resize(0, -20)));
    bar.appendChild(mkBtn('Delete', () => this._delete()));
    bar.appendChild(mkBtn('Exit (F2)', () => this.toggle()));
    const info = document.createElement('div'); info.className = 'ed-info';
    info.textContent = 'Click to place · drag to move · Delete removes · Save overwrites this level';
    el.appendChild(pal); el.appendChild(bar); el.appendChild(info);
    root.appendChild(el);
    this.el = el; this.pal = pal; this._refreshTools();

    const c = this.game.canvas;
    c.addEventListener('pointerdown', (e) => { if (this.enabled) { this._down(e); e.stopPropagation(); } }, true);
    c.addEventListener('pointermove', (e) => { if (this.enabled) this._move(e); }, true);
    window.addEventListener('pointerup', () => { this.drag = null; });
  }

  _refreshTools() { this.pal.querySelectorAll('.ed-tool').forEach((b) => b.classList.toggle('sel', b.dataset.tool === this.tool)); }
  toggle() { this.enabled = !this.enabled; this.el.classList.toggle('on', this.enabled); }

  _w2(e) {
    const v = this.game.computeView();
    const r = this.game.canvas.getBoundingClientRect();
    const g = this.grid;
    return {
      x: Math.round((v.camX + (e.clientX - r.left) / v.scale) / g) * g,
      y: Math.round((v.camY + (e.clientY - r.top) / v.scale) / g) * g
    };
  }
  _hit(p) {
    const w = this.game.world;
    const lists = [w.platforms, w.breakables, w.doors, w.traps, w.enemies, w.capsules];
    for (const list of lists) for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i], ow = o.w || 22, oh = o.h || 22;
      if (p.x >= o.x - 4 && p.x <= o.x + ow + 4 && p.y >= o.y - 4 && p.y <= o.y + oh + 4) return { o, list };
    }
    return null;
  }

  _down(e) {
    const p = this._w2(e);
    if (this.tool === 'select') {
      const h = this._hit(p);
      this.sel = h ? h.o : null; this._selList = h ? h.list : null;
      if (h) this.drag = { ox: p.x - h.o.x, oy: p.y - h.o.y };
      return;
    }
    this._place(p);
  }
  _move(e) {
    if (!this.drag || !this.sel) return;
    const p = this._w2(e);
    this.sel.x = p.x - this.drag.ox; this.sel.y = p.y - this.drag.oy;
    if (this.sel._x0 !== undefined) { this.sel._x0 = this.sel.x; this.sel._y0 = this.sel.y; }
  }

  _place(p) {
    const w = this.game.world, t = this.tool;
    const add = (list, o) => { list.push(o); this.sel = o; this._selList = list; this.tool = 'select'; this._refreshTools(); };
    if (t === 'platform') add(w.platforms, { x: p.x, y: p.y, w: 160, h: 22, wall: false, _x0: p.x, _y0: p.y, dx: 0, dy: 0 });
    else if (t === 'wall') add(w.platforms, { x: p.x, y: p.y, w: 28, h: 160, wall: true, _x0: p.x, _y0: p.y, dx: 0, dy: 0 });
    else if (t === 'mover') add(w.platforms, { x: p.x, y: p.y, w: 150, h: 24, _x0: p.x, _y0: p.y, dx: 0, dy: 0, move: { x2: p.x + 200, y2: p.y, period: 3 } });
    else if (t === 'breakable') add(w.breakables, { x: p.x, y: p.y, w: 24, h: 100, hp: 40, maxHp: 40, alive: true, hitFlash: 0 });
    else if (t === 'exit') w.exit = { x: p.x, y: p.y, w: 56, h: 120 };
    else if (t === 'door') { const id = 'g' + (w.doors.length + 1); add(w.doors, { id, x: p.x, y: p.y, w: 30, h: 110, open: false }); }
    else if (t === 'switch') { const d = w.doors[0]; add(w.switches, { x: p.x, y: p.y, door: d ? d.id : 'g1', on: false }); }
    else if (t === 'trap') add(w.traps, { x: p.x, y: p.y, w: 160, h: 20, armed: true, period: 0, phase: 0 });
    else if (t === 'capS') add(w.capsules, { x: p.x, y: p.y, w: 22, h: 22, big: false, taken: false, bob: 0 });
    else if (t === 'capB') add(w.capsules, { x: p.x, y: p.y, w: 30, h: 30, big: true, taken: false, bob: 0 });
    else if (t === 'spawn') { w.spawn = { x: p.x, y: p.y }; this.game.cp = { x: p.x, y: p.y }; this.game.player.reset(p.x, p.y, 1); }
    else { // enemy types (incl relay)
      const hp = t === 'shooter' ? 900 : t === 'tank' ? 600 : undefined;
      const sz = t === 'tank' ? 96 : t === 'shooter' ? 50 : t === 'relay' ? 44 : 40;
      add(w.enemies, { x: p.x, y: p.y, w: sz, h: sz, type: t, x1: p.x - 120, x2: p.x + 120, baseX: p.x, baseY: p.y, phase: 0, hp: hp ?? 12, maxHp: hp ?? 12, shield: t === 'shielded', dir: 1, vx: 0, vy: 0, alive: true, hitFlash: 0, shootT: 0 });
    }
  }

  _resize(dw, dh) { if (!this.sel || this.sel.w === undefined) return; this.sel.w = Math.max(10, this.sel.w + dw); this.sel.h = Math.max(10, this.sel.h + dh); }
  _delete() {
    if (!this.sel || !this._selList) return;
    const i = this._selList.indexOf(this.sel); if (i >= 0) this._selList.splice(i, 1);
    this.sel = null; this._selList = null;
  }

  // draw selection + grid overlay (called from game after drawScene, in world space)
  draw(ctx, view) {
    if (!this.enabled) return;
    if (this.sel) {
      const o = this.sel, ow = o.w || 22, oh = o.h || 22;
      ctx.save();
      ctx.strokeStyle = '#ffe23a'; ctx.lineWidth = 2 / view.scale;
      ctx.setLineDash([6 / view.scale, 4 / view.scale]);
      ctx.strokeRect(o.x - 2, o.y - 2, ow + 4, oh + 4);
      ctx.restore();
    }
  }

  // ── serialize the live world back to a level object ──
  serialize() {
    const w = this.game.world, lv = w.level || {};
    const clean = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
    const relays = w.enemies.filter((e) => e.type === 'relay').map((e) => ({ x: e.x, y: e.y }));
    const out = {
      id: lv.id, name: lv.name || 'Custom', w: w.w, h: w.h, spawn: { ...w.spawn }, facing: w.facing || 1,
      platforms: w.platforms.map((p) => { const o = clean(p, ['x', 'y', 'w', 'h', 'wall', 'bound']); if (p.move) o.move = { x2: p.move.x2, y2: p.move.y2, period: p.move.period, phase: p.move.phase || 0 }; return o; }),
      breakables: w.breakables.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, hp: b.maxHp })),
      doors: w.doors.map((d) => ({ id: d.id, x: d.x, y: d.y, w: d.w, h: d.h })),
      switches: w.switches.map((s) => ({ x: s.x, y: s.y, door: s.door })),
      traps: w.traps.map((t) => clean(t, ['x', 'y', 'w', 'h', 'period', 'phase'])),
      capsules: w.capsules.filter((c) => !c.taken).map((c) => ({ x: c.x, y: c.y, big: !!c.big })),
      enemies: w.enemies.filter((e) => e.type !== 'relay' && !e.child).map((e) => clean({ x: e.x, y: e.y, type: e.type, hp: e.maxHp, w: e.w, h: e.h, x1: e.x1, x2: e.x2 }, ['x', 'y', 'type', 'hp', 'w', 'h', 'x1', 'x2']))
    };
    if (w.exit) out.exit = { ...w.exit };
    if (w.boss) out.boss = { x: w.boss.x, y: w.boss.y, w: w.boss.w, h: w.boss.h, tier: w.boss.tier, archetype: w.boss.archetype, relays: relays.length ? relays : undefined };
    return out;
  }

  save() {
    const obj = this.serialize();
    obj._rev = LEVELS_REV;            // stamp so a later levels.js change invalidates this
    const json = JSON.stringify(obj);
    try { localStorage.setItem('prism_lvl_' + this.game.prism_state.currentLevel, json); } catch {}
    const pretty = JSON.stringify(obj, null, 2);
    try { navigator.clipboard && navigator.clipboard.writeText(pretty); } catch {}
    console.log('[editor] saved level override + copied JSON:\n', pretty);
    this.el.querySelector('.ed-info').textContent = 'Saved! Override stored + JSON copied to clipboard.';
  }
  revert() {
    try { localStorage.removeItem('prism_lvl_' + this.game.prism_state.currentLevel); } catch {}
    this.game.loadLevel(this.game.prism_state.currentLevel);
    this.el.querySelector('.ed-info').textContent = 'Reverted to the built-in level.';
  }
}

// Returns a localStorage level override for index i, or null. Overrides stamped
// with an older LEVELS_REV are stale (the built-in changed underneath them) → drop
// them so edits can't silently shadow a redesigned built-in level.
const loadLevelOverride = (i) => {
  try {
    const r = localStorage.getItem('prism_lvl_' + i); if (!r) return null;
    const o = JSON.parse(r);
    if (!o || o._rev !== LEVELS_REV) { localStorage.removeItem('prism_lvl_' + i); return null; }
    return o;
  } catch {}
  return null;
};


// ── game.js ──────────────────────────────────────────────
// game.js — the engine. Fixed-step loop, raw DOM input (keyboard + mouse-hold +
// touch via ui), camera-follow, collisions, Volt decay, the single `prism_state`,
// persistence, and the `window.__prism` verification API.


const SAVE_KEY = 'prism_state';
const FIXED = 1 / 120;
const GT = TUNING;

class Game {
  volt-flickeror(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.dpr = 1;
    this.world = new World(); this.player = new Player(); this.skills = new Skills();
    this.juice = new Juice(); this.audio = new Audio2(); this.ui = new UI(); this.editor = new Editor(this);
    this.acc = 0; this.last = 0; this.running = false;
    this.keys = { left: false, right: false }; this.uiMove = 0;
    this.input = { beamHeld: false, radialHeld: false, moveDir: 0 };
    this.lastJumpAt = -1; this.time = 0; this.phase = 'playing';
    this.cp = null;          // checkpoint: last ground touched (roadmap #3)
    this.cpUsed = false;     // one checkpoint respawn per run; 2nd death = full reset
    this.prism_state = this._load(); window.prism_state = this.prism_state;
  }

  _default() { return { version: 1, currentLevel: 0, unlockedCount: 1, muted: false }; }
  _load() { try { const r = localStorage.getItem(SAVE_KEY); if (r) return Object.assign(this._default(), JSON.parse(r)); } catch {} return this._default(); }
  _save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, currentLevel: this.prism_state.currentLevel, unlockedCount: this.prism_state.unlockedCount, muted: this.prism_state.muted })); } catch {} }

  boot(root) {
    this.audio.setMuted(this.prism_state.muted);
    this.ui.mount(root, {
      move: (d) => { this.uiMove = d; },
      jump: () => this._jumpInput(),
      dash: () => this._dashInput(),
      hold: (which, v) => { if (which === 'beam') this.input.beamHeld = v; else this.input.radialHeld = v; this.audio.resume(); },
      openLevels: () => this.openLevels(),
      openEditor: () => this.editor.toggle(),
      selectLevel: (i) => this.loadLevel(i),
      toggleMute: () => { this.prism_state.muted = !this.prism_state.muted; this.audio.setMuted(this.prism_state.muted); this._save(); }
    });
    this.editor.mount(root);
    this._bindInput(); this.resize(); window.addEventListener('resize', () => this.resize());
    this.loadLevel(clamp(this.prism_state.currentLevel | 0, 0, LEVELS.length - 1));
    this.start();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = dpr; this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.cssW = w; this.cssH = h;
  }

  _bindInput() {
    window.addEventListener('keydown', (e) => {
      const k = e.code;
      if (k === 'F2') { this.editor.toggle(); e.preventDefault(); return; } // level editor (#19)
      if (this.editor.enabled) return; // editor open → ignore gameplay keys
      if (['ArrowLeft', 'KeyA'].includes(k)) this.keys.left = true;
      else if (['ArrowRight', 'KeyD'].includes(k)) this.keys.right = true;
      else if (['Space', 'ArrowUp', 'KeyW'].includes(k)) { if (!e.repeat) this._jumpInput(); }
      // Dash on E only (no more accidental double-tap-jump dashes) + touch DASH button.
      else if (k === 'KeyE') { if (!e.repeat) this._dashInput(); }
      // SHIFT = charged Plasma Beam (hold), STRG/CTRL = Radial Discharge (hold).
      else if (['ShiftLeft', 'ShiftRight'].includes(k)) { this.input.beamHeld = true; this.audio.resume(); }
      else if (['ControlLeft', 'ControlRight'].includes(k)) { this.input.radialHeld = true; this.audio.resume(); }
      else if (k === 'KeyJ') { this.input.beamHeld = true; this.audio.resume(); }
      else if (k === 'KeyK') { this.input.radialHeld = true; this.audio.resume(); }
      else if (['Escape', 'KeyP'].includes(k)) this.openLevels();
      else if (k === 'KeyM') { this.prism_state.muted = !this.prism_state.muted; this.audio.setMuted(this.prism_state.muted); this._save(); }
      else return;
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.code;
      if (['ArrowLeft', 'KeyA'].includes(k)) this.keys.left = false;
      else if (['ArrowRight', 'KeyD'].includes(k)) this.keys.right = false;
      else if (['ShiftLeft', 'ShiftRight', 'KeyJ'].includes(k)) this.input.beamHeld = false;
      else if (['ControlLeft', 'ControlRight', 'KeyK'].includes(k)) this.input.radialHeld = false;
    });
    // mouse hold = skills (bound to canvas so HUD clicks don't fire skills)
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.editor.enabled) return; // editor handles canvas clicks
      this.audio.resume();
      if (e.button === 0) this.input.beamHeld = true;
      else if (e.button === 2) this.input.radialHeld = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.beamHeld = false;
      else if (e.button === 2) this.input.radialHeld = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _jumpInput() {
    this.audio.resume();
    if (this.phase !== 'playing') return;
    this.player.tryJump();
    this.jumpFlash = this.time;
  }

  _dashInput() {
    this.audio.resume();
    if (this.phase !== 'playing') return;
    this.player.tryDash();
    this.dashFlash = this.time;
  }

  _moveDir() { const kd = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0); const d = kd + this.uiMove; return d > 0 ? 1 : d < 0 ? -1 : 0; }

  loadLevel(i) {
    i = clamp(i | 0, 0, LEVELS.length - 1);
    this.prism_state.currentLevel = i;
    this.world.load(loadLevelOverride(i) || LEVELS[i]); // editor override if present (#19)
    this.player.reset(this.world.spawn.x, this.world.spawn.y, this.world.facing);
    this.skills.reset(); this.juice.reset();
    this.input.beamHeld = this.input.radialHeld = false;
    this.time = 0; this.phase = 'playing';
    this.cp = { x: this.world.spawn.x, y: this.world.spawn.y };
    this.cpUsed = false;
    this.ui.hideMessage(); this.ui.closeModal(); this.ui.showKeymap(i === 0); this._save(); this._hud();
  }

  openLevels() { this.ui.openModal(LEVELS, this.prism_state.unlockedCount); }

  _hud() {
    const lv = LEVELS[this.prism_state.currentLevel];
    this.ui.update({ levelNum: this.prism_state.currentLevel + 1, levelName: lv.name, volt: this.player.volt, over: this.player.over, muted: this.prism_state.muted });
  }

  start() { if (this.running) return; this.running = true; this.last = performance.now(); requestAnimationFrame((t) => this._frame(t)); }
  stop() { this.running = false; }

  _frame(t) {
    if (!this.running) return;
    let dt = (t - this.last) / 1000; this.last = t; dt = Math.min(dt, 0.05);
    const active = !this.ui.isModalOpen() && !this.editor.enabled; // editor pauses gameplay
    // Hitstop (roadmap #5): brief full-freeze. Slow-mo (roadmap #10): time scale.
    const j = this.juice;
    if (j.freezeT > 0) j.freezeT -= dt;
    let gdt = dt;
    if (j.freezeT > 0) gdt = 0;
    else if (j.slowmoT > 0) { j.slowmoT -= dt; gdt = dt * j.slowmoScale; }
    this.acc += gdt;
    while (this.acc >= FIXED) { if (active && this.phase === 'playing') this._step(FIXED); this.acc -= FIXED; }
    if (!(active && this.phase === 'playing') && j.freezeT <= 0) this.juice.particles.update(dt);
    // keymap green-highlight for currently-active inputs (Level 1 legend)
    const tt = this.time;
    this.ui.setActive({
      left: this.keys.left || this.uiMove < 0,
      right: this.keys.right || this.uiMove > 0,
      jump: (tt - (this.jumpFlash ?? -1)) < 0.18,
      dash: this.player.dashing || (tt - (this.dashFlash ?? -1)) < 0.18,
      beam: this.input.beamHeld,
      radial: this.input.radialHeld
    });
    drawScene(this.ctx, this.cssW, this.cssH, this._rs());
    if (this.editor.enabled) {
      const v = this.computeView();
      this.ctx.save();
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx.scale(v.scale, v.scale); this.ctx.translate(-v.camX, -v.camY);
      this.editor.draw(this.ctx, v);
      this.ctx.restore();
    }
    requestAnimationFrame((t2) => this._frame(t2));
  }

  computeView() {
    const scale = Math.min(this.cssH / GT.viewH, this.cssW / 560);
    const visW = this.cssW / scale, visH = this.cssH / scale;
    const p = this.player;
    let camX = clamp(p.cx - visW / 2, 0, Math.max(0, this.world.w - visW));
    let camY = clamp(p.cy - visH / 2, 0, Math.max(0, this.world.h - visH));
    if (this.world.w < visW) camX = (this.world.w - visW) / 2;
    if (this.world.h < visH) camY = (this.world.h - visH) / 2;
    return { scale, camX, camY, w: visW, h: visH };
  }

  _rs() { return { world: this.world, player: this.player, skills: this.skills, juice: this.juice, view: this.computeView(), time: this.time, dpr: this.dpr }; }

  _step(dt) {
    this.time += dt;
    this.world._lastDt = dt;
    const view = this.computeView();
    this.input.moveDir = this._moveDir();

    this.player.update(dt, this.input, this.world);
    if (this.player.justJumped) this.audio.jump();
    if (this.player.justWallJumped) this.audio.jump();
    if (this.player.justDashed) { this.audio.dash(); this.juice.dash(this.player.cx, this.player.cy); }

    this.skills.update(dt, this.input, { player: this.player, world: this.world, juice: this.juice, audio: this.audio, view });
    // charged beam band → trigger switches it reaches (LOS, blocked by walls)
    if (this.world.beamBlast) this._beamSwitches();

    this.world.update(dt);
    updateEnemies(this.world, dt, this.player);
    updateBoss(this.world, dt, this.player);
    updateRadial(this.world, this.juice);
    updateBeamBlast(this.world, dt);

    // passive Volt decay (may push into debt; not clamped at 0)
    if (this.player.alive) this.player.volt = Math.max(-GT.voltMax, this.player.volt - GT.voltDecayPerSec * dt);

    this._collide();

    // VOLT DEBT (feature #4): below 0 you run on borrowed power; a grace timer
    // counts down to flatline. Climb back to ≥0 (capsules) to reset it.
    const p = this.player;
    if (p.alive) {
      if (p.volt < 0) { p.debtTimer -= dt; if (p.volt <= -GT.voltMax || p.debtTimer <= 0) p.alive = false; }
      else p.debtTimer = GT.debtGrace;
    }

    // OVERPOWERED (roadmap #20): overcharge >110% → 3× speed, one-shot contact,
    // dash through walls; burns overDrain%/s until it drops below 100%.
    if (p.alive) {
      if (!p.over && p.volt > GT.overEnter) {
        p.over = true;
        this.juice.spawnLabel('OVERPOWERED', p.cx, p.cy - 46, '#ffe23a', 42);
        this.juice.flashScreen('#fff2a0', 0.5); this.juice.kick(GT.shakeBeamMax);
        this.audio.beamFire(true);
      }
      if (p.over) { p.volt = Math.max(p.volt - GT.overDrain * dt, -GT.voltMax); if (p.volt < GT.overExit) p.over = false; }
    }

    // checkpoint: remember the last ground touched (roadmap #3)
    if (p.alive && p.onGround) this.cp = { x: p.x, y: p.y };

    this.juice.update(dt);

    if (!this.player.alive) { this._die(); return; }
    if (this.world.boss && this.world.boss.dead) { this._win(true); return; }
    if (this.world.exit && aabbOverlap(this.player.box, this.world.exit)) { this._win(false); return; }
    this._hud();
  }

  _beamSwitches() {
    const b = this.world.beamBlast;
    for (const sw of this.world.switches) if (!sw.on && aabbOverlap({ x: sw.x - 12, y: sw.y - 12, w: 24, h: 24 }, b)) { this.world.triggerSwitch(sw); this.juice.switchSpark(sw.x, sw.y); }
  }

  _collide() {
    const p = this.player, w = this.world;
    // enemy + boss projectiles vs player
    for (let i = w.projectiles.length - 1; i >= 0; i--) {
      const pr = w.projectiles[i];
      if (pr.from === 'player') continue;
      if (aabbOverlap({ x: pr.x - pr.r, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 }, p.box)) {
        if (p.hit(pr.dmg)) this.juice.hit(p.cx, p.cy);
        w.projectiles.splice(i, 1);
      }
    }
    // player projectiles vs switches (LOS taps)
    for (const pr of w.projectiles) {
      if (pr.from !== 'player') continue;
      for (const sw of w.switches) if (!sw.on && aabbOverlap({ x: pr.x - pr.r, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 }, { x: sw.x - 12, y: sw.y - 12, w: 24, h: 24 })) { w.triggerSwitch(sw); this.juice.switchSpark(sw.x, sw.y); pr.life = 0; }
    }
    // capsules
    for (const c of w.capsules) { if (!c.taken && aabbOverlap(p.box, { x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h })) { c.taken = true; p.addVolt(c.big ? GT.capsuleBig : GT.capsuleSmall); this.juice.capsule(c.x, c.y, c.big); this.audio.capsule(c.big); } }
    // traps
    for (const t of w.traps) if (t.armed && aabbOverlap(p.box, t)) { if (p.hit(GT.trapDrain)) this.juice.hit(p.cx, p.cy); }
    // enemies (contact)
    for (const e of w.enemies) {
      if (!e.alive) continue;
      if (aabbOverlap(p.box, e)) {
        if (p.over) {
          // OVERPOWERED: one-shot enemies on contact, take no damage (roadmap #20)
          if (!e.shield || true) { e.alive = false; this.juice.kick(2); this.juice.enemyDie(e.x + e.w / 2, e.y + e.h / 2); }
        } else if (p.hit(GT.enemyContactDrain)) {
          this.juice.hit(p.cx, p.cy); const kn = Math.sign(p.cx - (e.x + e.w / 2)) || 1; p.vx = kn * GT.enemyContactKnock; p.vy = -260;
        }
      }
    }
    // boss body contact (immune while OVERPOWERED)
    if (w.boss && w.boss.alive && !p.over && aabbOverlap(p.box, w.boss)) { if (p.hit(GT.enemyContactDrain)) { this.juice.hit(p.cx, p.cy); p.vy = -260; } }
    // dead enemies → particles (once)
    for (const e of w.enemies) if (!e.alive && !e._fx) { e._fx = true; this.juice.enemyDie(e.x + e.w / 2, e.y + e.h / 2); this.audio.enemyDie(); this._dropCapsules(e); }
  }

  // Dead enemies drop energy capsules — at least a small one; stronger enemies
  // (tanks/turrets) give big ones so killing them refuels the Volt they cost.
  _dropCapsules(e) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const bigs = e.maxHp >= 1500 ? 2 : e.maxHp >= 100 ? 1 : 0;
    const smalls = e.maxHp >= 100 ? 1 : 1; // everyone drops at least one small
    // dropCapsule lifts drops clear of any solid so they can't end up buried.
    const push = (big) => this.world.dropCapsule(cx + (Math.random() * 2 - 1) * 22, cy + (Math.random() * 2 - 1) * 14, big);
    for (let i = 0; i < bigs; i++) push(true);
    for (let i = 0; i < smalls; i++) push(false);
  }

  // CHECKPOINT RESPAWN (roadmap #3): instead of a full restart, flicker back to
  // the last ground touched at 40% Volt — level progress (dead enemies, opened
  // gates) is kept, so death costs momentum, not the whole run.
  _die() {
    if (this.phase !== 'playing') return;
    const p = this.player;
    const dx = p.cx, dy = p.cy;
    this.audio.death(); this.audio.silenceHum && this.audio.silenceHum();
    // Boss arenas NEVER checkpoint (roadmap #3 is for platforming stages): a
    // mid-fight respawn would let you chip the boss down across deaths, since its
    // armor/relays/children/projectiles persist. And on a normal level you get
    // exactly ONE checkpoint respawn — a second death restarts the level fresh
    // at full Volt. Both cases reload the arena so nothing persists.
    if (this.world.boss || this.cpUsed) {
      this.loadLevel(this.prism_state.currentLevel);
      this.juice.death(dx, dy);
      this.player.invuln = 1.0; // brief mercy invuln on the fresh start
      this.juice.spawnLabel('RETRY', this.world.spawn.x + p.w / 2, this.world.spawn.y - 10, '#ff5c7a', 26);
      return;
    }
    // first death on a normal level → seamless checkpoint respawn
    this.juice.death(dx, dy);
    this.cpUsed = true;
    const cp = this.cp || this.world.spawn;
    this.world.projectiles = this.world.projectiles.filter((pr) => pr.from === 'player'); // clear incoming fire
    p.reset(cp.x, cp.y, this.world.facing);
    p.volt = GT.checkpointVolt;
    p.invuln = 1.0; // brief mercy invuln on respawn
    this.juice.spawnLabel('RESPAWN', cp.x + p.w / 2, cp.y - 10, '#7fd8ff', 26);
  }

  _win(boss) {
    if (this.phase !== 'playing') return;
    this.phase = 'won';
    this.juice.win(this.player.cx, this.player.cy); this.audio.win();
    const i = this.prism_state.currentLevel;
    if (i + 1 >= this.prism_state.unlockedCount) this.prism_state.unlockedCount = Math.min(LEVELS.length, i + 2);
    this._save();
    const hasNext = i + 1 < LEVELS.length;
    const acts = [];
    if (hasNext) acts.push({ label: 'Next', onClick: () => this.loadLevel(i + 1) });
    acts.push({ label: 'Replay', alt: true, onClick: () => this.loadLevel(i) });
    acts.push({ label: 'Levels', alt: true, onClick: () => this.openLevels() });
    this.ui.showMessage(boss ? 'SYSTEM PURGED' : 'LEVEL CLEAR', boss ? 'the final flicker holds' : 'powered through', 'win', acts);
  }

  // ── verification API ──
  installDebugApi() {
    const self = this;
    window.__prism = {
      get engine() { return self; }, get world() { return self.world; }, get player() { return self.player; },
      snapshot() {
        const p = self.player, b = self.world.boss;
        return {
          level: self.prism_state.currentLevel, levelNum: self.prism_state.currentLevel + 1, name: LEVELS[self.prism_state.currentLevel].name,
          phase: self.phase, time: +self.time.toFixed(2),
          player: { x: +p.x.toFixed(1), y: +p.y.toFixed(1), vx: +p.vx.toFixed(0), vy: +p.vy.toFixed(0), onGround: p.onGround, wallDir: p.wallDir, dashing: p.dashing, alive: p.alive },
          volt: +p.volt.toFixed(1), enemiesAlive: self.world.enemiesAlive(),
          boss: b ? { armor: b.armor, alive: b.alive, dead: b.dead } : null,
          projectiles: self.world.projectiles.length, beamBlast: !!self.world.beamBlast, radial: !!self.world.radial,
          dead: self.phase === 'dead', won: self.phase === 'won', unlocked: self.prism_state.unlockedCount
        };
      },
      loadLevel: (i) => self.loadLevel(i),
      tick: (dt = 1 / 120, n = 1) => { const a = !self.ui.isModalOpen(); for (let k = 0; k < n; k++) if (a && self.phase === 'playing') self._step(dt); },
      pin: (x, y) => { const p = self.player; p.x = x; p.y = y; p.vx = 0; p.vy = 0; },
      setMove: (d) => { self.uiMove = d; },
      jump: () => self._jumpInput(), dash: () => self.player.tryDash(),
      hold: (which, v) => { if (which === 'beam') self.input.beamHeld = v; else self.input.radialHeld = v; },
      addVolt: (d) => self.player.addVolt(d), setVolt: (v) => { self.player.volt = v; },
      win: () => self._win(!!self.world.boss), die: () => { self.player.volt = 0; self.player.alive = false; }
    };
    return window.__prism;
  }
}


// ── c3-entry.js ──────────────────────────────────────────────
// c3-entry.js — single boot path for BOTH targets. Creates a full-bleed canvas,
// starts the engine, installs the debug API. In volt-flicker the global
// `runOnStartup` exists (boot when the runtime is ready); in the standalone
// harness it doesn't, so we boot on DOMContentLoaded. The engine itself never
// touches any volt-flicker API, so identical code runs in both.


const startPrism = () => {
  if (window.__prismGame) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'prism-canvas';
  // z-index must sit ABOVE volt-flicker's own runtime canvas/shell, or Preview shows
  // a blank C3 canvas over our game. A huge z-index guarantees we're on top in
  // both the harness (no other canvas) and inside volt-flicker.
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;z-index:2147483000;touch-action:none;background:#e9edf1';
  document.body.appendChild(canvas);
  const game = new Game(canvas);
  window.__prismGame = game;
  game.installDebugApi();
  game.boot(document.body);
};

if (typeof runOnStartup === 'function') {
  // volt-flicker: boot once the runtime is ready. Wrapped in try/catch so a boot
  // throw surfaces in the console instead of silently leaving a blank canvas.
  // eslint-disable-next-line no-undef
  runOnStartup(async () => {
    try { startPrism(); }
    catch (e) { console.error('[Prism] boot failed', e); }
  });
} else if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startPrism);
  else startPrism();
}


})();
