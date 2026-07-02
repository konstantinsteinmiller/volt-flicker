# Project Volt-Flicker — Future Roadmap

Prioritized for **Day-1 retention**, **average playtime**, **easy-to-pickup /
hard-to-put-down**, and **new-player → engaged-player conversion**. Sorted by
impact × (perf-safety + game-feel). Everything is JS-first (`.c3-build/run/prism/*.js`),
so none of it touches volt-flicker's event cap.

> Effort: S ≈ <½ day · M ≈ 1–2 days · L ≈ 3–5 days.

### Tier 1 — biggest pickup / retention levers

1. **Onboarding beat-pacing + control coach.** [M] *Day-1 retention.* The first
   30s must teach move/jump/dash/beam without text. Gate L1 sections so each verb
   is required once; the existing textless silhouette system (`render.drawTutorial`)
   extends to a dash-gap prompt and a "hold to charge" ring. Add a one-time
   control hint that fades after first use.
2. **Volt = score multiplier (risk/reward made legible).** [S] *Hard-to-put-down.*
   Show a live "flow" multiplier that climbs the longer you stay above 70% Volt and
   resets on hit — turns the resource into a chase. Drives the GDD's core tension.
3. **Checkpoint + instant retry.** [S] *Reduces churn.*  ✅ DONE — On death, respawn
   at the last ground touched with 40% Volt instead of full restart.
   *Done:* `game.cp` tracks the last grounded spot; `_die` seamlessly respawns there
   at `checkpointVolt` (40%), keeping level progress (no game-over screen).
   *Refined:* you get exactly ONE checkpoint respawn per run (`game.cpUsed`) — a
   second death restarts the level fresh at full Volt. **Boss arenas never
   checkpoint** (any death restarts the whole fight) so the boss's armor/relays/
   children can't be chipped down across deaths. Both full-restart paths reload the
   arena via `loadLevel`.
4. **Per-level medals (time + Volt-remaining + no-hit).** [M] *Replay/playtime.*
   Three stars per level shown on the select grid; persist bests in `prism_state`.
   Converts "cleared" into "mastered".
5. **Juicier hit/kill feedback (hitstop + directional knockback).** [S] *Game feel.*  ✅ DONE
   2–4 frame freeze on Max-Power kills and boss cracks; already have particles +
   (toned) shake. Big perceived-quality win for tiny cost.
   *Done:* `juice.hitstop()` freezes the loop in `game._frame` on Max-Power kills
   (`skills`) + boss armor cracks (`enemies`); contact knockback already in
   `player`. Tunables `hitstopKill`/`hitstopBoss`.

### Tier 2 — feel & depth that compounds

6. **Aimable beam (twin-stick / mouse-aim option).** [M] Let the beam fire toward
   the pointer / right-stick instead of pure facing, with the Max Power staying
   horizontal. Adds skill ceiling without breaking mobile (facing remains default).
7. **Enemy variety pass.** [M] Add a charger, a shielded foe (needs radial first),
   and a turret — each teaches a skill. Data-only additions in `levels.js` + small
   `enemies.js` brains.  ✅ DONE
   *Done:* `charger` (rushes the player), `shielded` (beam-proof until a Radial
   pops the shield, then Beam kills) + existing `shooter` turret; brains in
   `enemies.js`, shield logic in `world.damageEnemy`/`skills.updateRadial`, render
   in `render.drawEnemies`. Distributed across the new stages.
8. **WebGL bloom pass for the electric look.** [L] Optional post-process for the
   arcs/beams; Canvas2D fallback stays. Gate on perf budget for low-end mobile 60fps.  ✅ DONE
   *Done:* `render.applyBloom` downsamples → blurs → adds the frame back ('lighter')
   so arcs/beams/capsules glow. Canvas2D path (the robust fallback). Tunables
   `TUNING.bloom/bloomScale/bloomBlur/bloomAlpha` (set `bloom:false` to disable).
9. **Haptics + adaptive audio layers.** [S] `navigator.vibrate` on dash/hit/kill;
   layer the procedural track so it intensifies as Volt drops (tension audio).
10. **Boss telegraphs + phase intros.** [M] Brief wind-up flashes before bullet
    volleys and a short slow-mo on each armor crack — makes the fight readable and
    cinematic (pairs with the 3-shot loop).  ✅ DONE
    *Done:* boss `telegraph` wind-up (`enemies.updateBoss` + a pulsing muzzle flash
    in `render.drawBoss`) fires the volley only after the tell; `juice.slowmo()` on
    each armor crack runs a cinematic slow-mo via `game._frame` time-scaling.

### Tier 3 — content, accessibility & growth

11. **Level pack expansion (12–18 stages) with a tuned difficulty curve.** [L]  ✅ DONE
    More `levels.js` entries introducing timed traps, moving platforms, multi-switch
    gates, escort/​survival beats.
    *Done:* 12 stages (was 3). New: moving platforms (rider-carry), multi-switch
    gates (door opens only when ALL its switches fire), timed traps, and
    **backtracking** stages (Backfeed/Meltdown: a deep switch opens a closed
    exit area by the start). Longer, MM10-condensed layouts; chargers/shielded/
    turrets ramp; boss is now stage 12.
    *MMX redesign pass:* every gameplay stage 4/5/7/8/10/11 (the "flat-with-gaps"
    boring ones) rebuilt as longer, multi-tier MMX-style stages — crater drop +
    climb-out + mover bridge + OP-rush (4); Radial gauntlet + mover + mandatory
    forgiving wall-climb + the OP-dash gate (5); island-hop over death-pits with
    perched turrets (7); two-switch AND-gate hunt + breakable vault + mover-lift (8);
    a 3-layer SERPENTINE (10) and a vertical TOWER (11), both rebuilt complex with
    MANDATORY wall-jump shafts, a beam-breakable on the path, a RADIAL-through-wall
    switch/door, a dash-gap, movers, and dense per-layer enemies (every ability
    used). Shaft climbs + dash-gaps were verified by a headless Player-physics sim
    (drive `Player.update` with a wall-jump/dash-jump bot). KEY: shaft exit floors
    must sit BESIDE the channel (open top) or the climber bonks their head.
    Tutorials removed from all stages ≥3 (only L1/L2 keep them). Enemies no longer
    slide through walls (`enemyHitsWall` guard in `enemies.js`). Boss/enemy capsule
    drops never land inside the mesh anymore — `world.dropCapsule()` ring-searches
    outward (biased up) for an open spot; both drop sites (`enemies.bossTakeMaxHit`,
    `game._dropCapsules`) route through it.
    *Stale-override fix:* editor overrides in `localStorage` (`prism_lvl_<index>`)
    were silently shadowing redesigned built-ins. Now `levels.LEVELS_REV` stamps
    each saved override and `loadLevelOverride` drops any with a mismatched rev — so
    bumping `LEVELS_REV` on a `levels.js` change auto-invalidates stale overrides.
12. **Endless "Overload Gauntlet" mode.** [M] Procedural arena waves that ramp Volt
    drain + enemy density; great for the hardcore tail and daily scores.
13. **Daily challenge (date-seeded).** [M] One deterministic stage/day + a local
    leaderboard slot in `prism_state`; a concrete reason to return tomorrow.
14. **Cosmetic Volt-skins / arc colors unlocked by medals.** [M] Pure-procedural
    palette swaps in `render.drawPlayer`; identity + a medal sink → investment.
15. **Accessibility: colorblind palettes, reduced-motion, remappable keys, aim-assist.**
    [S–M] Alternate `TUNING.col` sets, a flag that caps shake/flash/hitstop, and
    key rebinding. Widens the funnel and avoids motion churn.
16. **First-session telemetry + funnel.** [S] Event beacons (level_start/clear/death/
    quit, time-to-first-clear, retries) behind a consent flag; dashboard the L1→L3
    drop-off to target onboarding.
17. **Share the kill-cam.** [S] Capture the canvas on a boss kill / no-hit clear and
    `navigator.share` a framed card — organic acquisition off the flashiest moment.
18. **Platform SDK wiring for the HTML5 export.** [M] Reuse the repo's existing
    CrazyGames / GamePix / Playgama adapters (`AdProvider` / `SaveManager`) to host
    the volt-flicker HTML5 export, mapping `prism_state` onto the cloud-save strategies.
19. **In-game level editor** [L] Allows to load and save/overwrite all levels using a drag & drop editor with all available
    enemies/items/assets.  ✅ DONE
    *Done:* `editor.js` — toggle with **F2** or the **✎ button in the HUD header**
    (wired via `ui.cb.openEditor` → `editor.toggle`). Tool palette (platforms/wall/
    mover/breakable/door/switch/trap/capsules/exit/spawn + every enemy incl. relay).
    Click to place, drag to move, Delete to remove, resize buttons. "Save" writes a
    per-level override to localStorage (auto-loaded by `loadLevel`, preserves boss
    `archetype`) + copies the level JSON to clipboard to paste into `levels.js`;
    "Revert" restores built-in.
20. ✅ DONE **Overpowered state** The player can reach an "overpowered"(Overpowered Label flies up wobbling and fades slowly like the damage numbers label) state if he picks up too much volt from energy capsules.
    The volt meter can overextend to 100+% indicated by a lightning yellow bar, only after surpassing 110%. While in Overpowered state, the player moves 3x as fast, one-shots enemies on contact and can dash through walls 
    (only walls inside the level, not level boundries). This feature should be introduces on level 4 and level 5 should not be finishable without dashing through a non-breakable
    wall in overpowered state. The Overpowered state consumes 5% volt per second, until the player falls below 100% total volt and is indicated by a hyper blink, that draws attention(need high-fidelity juice as its basicly the core of the game jam theme).
    Against bosses this overpowered state does not one-shot, but instead deals the same damage as a fully charged shot instantly, but throttled every 0.5 seconds of cooldown on the same target(so you cant oneshot boss by jumping into it).
21. ✅ DONE Add a boss every 3 levels, beyond on level 3. So move current level 6 to 7 and insert a new and more challenging boss at level 6 instead, do so also for the other levels.
    *Done:* bosses at L3/6/9/12. Gameplay stages fill 1,2,4,5,7,8,10,11.
22. ✅ DONE Boss variety — give each boss a DISTINCT MMX-style brain instead of one
    tier-scaled bullet pattern (L6 was just L3 + children + faster fire).
    *Done:* `enemies.js` dispatches on a per-boss `archetype` (data in `levels.js`,
    wired in `world.js`):
    · **gunner** (L3) — stationary artillery: sways the top, aimed spread + radial.
    · **diver** (L6, Storm Eagle) — hovers a side dropping feather-rain, then LOCKS
      the player's height and charge-dives the lane (telegraphed band in `render.js`;
      dash/jump out of it). No children — the dive *is* the threat.
    · **warden** (L9, Boomer Kuwanger) — teleport-blinks + returning boomerangs
      (projectile `turn` curve in `world.js`); relay shield holds until 3 relays die,
      then each blink leaves a longer exposed punish window.
    · **overlord** (L12, Spark Mandrill) — wall-clings at the player's height, then
      wall-dashes raining ceiling sparks; harasser swarm + radial enrage at low armor.
    Tunables: `bossDiveWind/bossDiveSpeed/bossBoomerangTurn`.
