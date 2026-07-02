// skills.js — Skill 1 (Plasma Beam) and Skill 2 (Radial Discharge), both
// charge-on-hold / fire-on-release. Effects are written onto the world
// (world.beamBlast, world.radial, world.projectiles) for render + per-frame
// resolution. Boss interaction is delegated to enemies.bossTakeMaxHit.

import { TUNING } from './tuning.js';
import { clamp, lerp, aabbOverlap, rayRect } from './core.js';
import { bossTakeMaxHit } from './enemies.js';

const ST = TUNING;

export class Skills {
  constructor() { this.reset(); }
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
export const updateRadial = (world, juice) => {
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
export const updateBeamBlast = (world, dt) => {
  if (!world.beamBlast) return;
  world.beamBlast.life -= dt;
  if (world.beamBlast.life <= 0) world.beamBlast = null;
};
