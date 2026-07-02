// player.js — the lightning entity. Nimble platforming (run, jump, double-jump,
// wall-slide, wall-jump, lightning dash) + the single Volt resource (health AND
// ammo). Movement is free; dash and skills cost Volt; 0% = death.

import { TUNING } from './tuning.js';
import { clamp, approach, aabbOverlap } from './core.js';

const PT = TUNING;

export class Player {
  constructor() { this.w = 34; this.h = 42; this.reset(0, 0, 1); }

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
