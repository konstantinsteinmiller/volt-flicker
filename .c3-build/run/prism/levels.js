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
export const LEVELS_REV = 5;

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

export const LEVELS = [
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

export const levelCount = () => LEVELS.length;
