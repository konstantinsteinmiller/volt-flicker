// game.js — the engine. Fixed-step loop, raw DOM input (keyboard + mouse-hold +
// touch via ui), camera-follow, collisions, Volt decay, the single `prism_state`,
// persistence, and the `window.__prism` verification API.

import { TUNING } from './tuning.js';
import { clamp, aabbOverlap } from './core.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Skills, updateRadial, updateBeamBlast } from './skills.js';
import { updateEnemies, updateBoss } from './enemies.js';
import { Juice } from './juice.js';
import { Audio2 } from './audio.js';
import { LEVELS } from './levels.js';
import { drawScene } from './render.js';
import { UI } from './ui.js';
import { Editor, loadLevelOverride } from './editor.js';

const SAVE_KEY = 'prism_state';
const FIXED = 1 / 120;
const GT = TUNING;

export class Game {
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
