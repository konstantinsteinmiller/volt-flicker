// tuning.js — Volt economy, movement feel, and palette for Project Volt-Flicker.
// World units are virtual pixels; the camera shows a VIEW_H-tall window scaled to
// the device, so the game is resolution-independent (see render.js / game.js).

export const TUNING = {
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
