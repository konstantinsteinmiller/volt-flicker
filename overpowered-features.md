# Project Volt-Flicker — 5 Unique "Overpowered" Features

Goal: make **"Overpowered" the gameplay loop itself**, not just a big laser. The
through-line of every idea below: *your own power is the threat.* That inversion
is the novel hook a jam judge remembers — power fantasies are everywhere; a power
fantasy that is actively trying to kill you is not.

All five fit the current engine (Volt = health + ammo, charge skills, platformer)
and are implementable JS-first in `.c3-build/run/prism/*.js` with no new volt-flicker
events.

---

## 1. OVERCLOCK — weaponized self-destruction (the signature feature)
At **100% Volt** you can trigger **Overclock**: a few seconds of literal god-mode
— infinite fire rate, beams pierce everything, you phase through walls and time
dilates — but Volt **hemorrhages** the entire time (e.g. 25%/s) and any hit is
doubled. End it before you flatline. Being maxed-out is the *most dangerous* state
in the game.

- *Why it wins the theme:* this IS "overpowered" — the apex of power is a countdown
  to death. The risk/reward is the whole game in one button.
- *Implement:* `player.overclock` state in `player.js`; gate entry on `volt>=98`;
  while active multiply drain in `game._step`, set `player.invulnFromWalls`/pierce
  flags read by `skills.js` + `player._collisionBodies`; time-dilation = scale the
  fixed-step `dt` for everything except the player. Big chromatic/scanline VFX in
  `juice.js`/`render.js`.

## 2. THE SYSTEM ADAPTS — difficulty scales with YOUR power
The world treats you as a containment breach. The **higher your Volt, the harder
the game fights back**: more turret fire, faster enemy spawns/patrols, extra boss
bullets. Drop low and it eases off. Power you hoard is power used against you, so
the optimal play is to stay *dangerously* lean — the opposite of every other game.

- *Why it wins the theme:* inverts the normal "get stronger → get easier" curve.
  Judges feel the theme in the *tuning*, not just the art.
- *Implement:* a single `threat = f(player.voltFrac)` in `game._step` feeding
  `enemyFireInterval`, spawn cadence, and `boss` pattern density in `enemies.js`.
  Cheap, dynamic, and instantly legible (UI: "CONTAINMENT LEVEL ↑").

## 3. RECOIL DRIVE — the OP weapon is your movement  ✅ IMPLEMENTED
Firing the big shots **blasts you backward** with force proportional to charge. A
Max Power discharge becomes a rocket-jump: beam-leap chasms, kick off walls,
combo a dash into a recoil-fling. But mis-aim and the recoil throws you into a
trap or off a ledge. The overpowered attack and your traversal are the same verb.

- *Why it wins the theme:* the weapon is so strong it moves *you*. Emergent
  movement tech from a combat tool = the kind of depth jammers clip and share.
- *Implement:* in `skills._fireBeam`, on release apply `player.vx/vy -= dir *
  recoil(charge)`; radial gives an omnidirectional pop. Already have knockback
  plumbing in `player.js`. Add a subtle aim line so recoil is intentional.
- *Status:* DONE — `skills._fireBeam` applies `player.vx -= dir * recoil(charge)`
  + upward lift; a charged radial pops the player up (`recoilRadial * frac`).
  Tunable in `tuning.js` (`recoilBeamMin/Max`, `recoilBeamLift`, `recoilRadial`).

## 4. VOLT DEBT — overdraw your own life  ✅ IMPLEMENTED
Let players **fire skills they can't afford**, dropping Volt **below zero into
debt** (shown as a red, draining overdraft meter). You're still alive on borrowed
power for a short grace window — enough to land the killing blow or grab a capsule
to climb back to 0. Miss the window and you flatline. Pure "spend power you don't
have."

- *Why it wins the theme:* removes the safety rail — you can always go bigger than
  you should. The most "overpowered" plays come from reckless debt.
- *Implement:* allow `player.volt` to go negative in `player.spend`; add
  `debtTimer` that ticks toward death while `volt<0` and resets when `volt>=0`;
  HUD bar already supports a red low state — extend it to render negative.
- *Status:* DONE — `player.canSpend`/`spend`/`hit` allow overdraw to −100%;
  passive decay no longer clamps at 0; `game._step` runs the `debtTimer`
  (`TUNING.debtGrace = 1.6s`) → flatline if it expires or Volt hits −100%; a
  capsule back to ≥0 resets it. HUD shows a pulsing red "DEBT −n%" bar.

## 5. TERMINAL DISCHARGE — death is the ultimate overpower
Dying ("The Final Flicker") doesn't just reset — your core **detonates in a
screen-clearing discharge**. If that blast vaporizes enough enemies / shatters
enough capsules, you **harvest their Volt and resurrect on the spot** with the
gathered charge. A great death can be the most powerful moment in a run, and
mastering "death farming" becomes a high-skill loop.

- *Why it wins the theme:* even your demise is overpowered. A risk-everything,
  clutch-comeback mechanic that produces highlight-reel moments.
- *Implement:* in `game._die`, spawn a big `world.radial`-style blast, sum Volt
  from enemies/capsules it catches; if `harvest >= threshold` → revive
  (`player.reset` at death spot with `volt = harvest`) instead of the lose screen.
  Reuse `enemies.bossTakeMaxHit`/radial resolution.

---

## How these stack
Pick **#1 (Overclock)** as the headline and **#2 (System Adapts)** as the
framing — together they turn "overpowered" from a noun (a weapon) into a verb (a
self-endangering choice you make every second). #3–#5 are force-multipliers that
each add a memorable, clip-worthy moment. Even shipping #1 + #2 alone would move
the game from "competent Mega Man + laser" to "the jam entry whose whole identity
is the theme."
