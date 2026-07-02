// render.js — Canvas2D. Camera follows the player; the world is drawn in world
// space (scaled to a VIEW_H-tall window → resolution independent). Dark low-poly
// shard field, electric Volt-driven player ball with procedural arcs, enemies,
// boss, skills FX, and textless tutorial silhouettes.

import { TUNING } from './tuning.js';
import { clamp, lerp, TAU, rng } from './core.js';

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
export const drawScene = (ctx, cssW, cssH, st) => {
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
