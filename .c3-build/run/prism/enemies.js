// enemies.js — enemy brains (patrol / float / tank) and the boss bullet-hell AI
// + the 3-Max-Power-shot armor loop that refuels the player with Big capsules.
// All functions operate on the World passed in (no engine state of their own).

import { TUNING } from './tuning.js';
import { TAU, rrange, clamp } from './core.js';

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

export const updateEnemies = (world, dt, player) => {
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

export const updateBoss = (world, dt, player) => {
  const b = world.boss;
  if (!b || !b.alive) return;
  b.hitFlash = Math.max(0, b.hitFlash - dt * 3);
  b.phaseT += dt;
  // shield stays up while any relay station survives (warden, roadmap #21)
  if (b.shielded) b.shielded = world.enemies.some((e) => e.type === 'relay' && e.alive);
  (BOSS_BRAINS[b.archetype] || bossGunner)(world, b, dt, player);
};

// A fully-charged Max Power shot connects with the boss.
export const bossTakeMaxHit = (world, juice, audio) => {
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
