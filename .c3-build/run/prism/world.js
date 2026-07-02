// world.js — live, mutable level instance. Holds solids (platforms, blockers,
// closed doors), switches, traps, capsules, enemies, the boss, and all flying
// projectiles. Owns simple per-frame updates (traps, doors, projectile motion);
// enemy/boss brains live in enemies.js, skills in skills.js.

import { TUNING } from './tuning.js';
import { aabbOverlap, TAU, clamp } from './core.js';

export class World {
  constructor() { this.reset(); }

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
