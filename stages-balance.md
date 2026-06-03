# Epicrolla — Stage Difficulty Balance

A derived view of the campaign difficulty curve, computed from the live constants
and formulas. Use it to spot where stages get *significantly* harder.

> **REBALANCE (current):** the speed and hazard-appear-chance ramps were stretched
> and lowered. The old **stage-10** difficulty now lands at **stage 20**; the old
> **stage-30** profile now lands at **stage 50**; the hazard appear chance is
> capped at **17%** (was 24%) and never exceeds **14%** until stage 50.

> **Assumptions for every number below**
> - **Campaign** mode, **Medium** difficulty, **not** the first-ever (onboarding) run, **0 deaths** (no rubber-band relief active).
> - Sources: `src/use/useEpicGame.ts` (`startSpeedForStage`, `stageHazardChance`), `src/use/useEpicProgress.ts` (`tilesToClear`), `src/use/useEpicArt.ts` (viewport geometry).
> - Speed unit = **diamonds per second**. Reaction time `RT = 1000 / speed` = ms the player has to read & react between hops.
> - **q** = per-cell hazard *appear chance* (the raw tunable). **Realised %** = actual fraction of cells that become hazards = `q/(1+q)` (the "no two adjacent hazards" rule thins it).

---

## 1. The knobs (source constants & formulas)

| Constant | Value | Meaning |
|---|---|---|
| `BASE_SPEED` | 2.5 | start speed at stage 1 |
| `MAX_SPEED` | 8.0 | hard speed cap |
| `EARLY_STAGE_RAMP` | 0.30 | within-stage acceleration, stages 1–10 |
| `LATE_STAGE_RAMP` | 0.66 | within-stage acceleration, stage 11+ |
| `RAMP_KNEE_STAGE` | 10 | ≤ uses EARLY ramp, above uses LATE |
| `HAZARD_EARLY_END` | 0.14 | q at the end of the 1→20 ramp; held flat to stage 50 |
| `HAZARD_MAX` | 0.17 | far-late-game q cap |
| `START_RUNWAY` | 7 | guaranteed-safe rows at the start of every stage |
| `C_MAX` | 10 | grid is 0–10 columns → **~5.5 valid cells per row** |
| `CRATE_PILE_STAGE / _CHANCE` | 5 / 0.02 | 2×2 crate-pile unlock + per-row spawn chance |

**Start speed (per stage)** — `startSpeedForStage(s)`, two linear segments + cap:
```
s ≤ 20 : 2.50 + (s-1) * (1.62/19)      // 2.50 → 4.12
20<s≤50: 4.12 + (s-20) * (3.60/30)     // 4.12 → 7.72   (slope 0.12)
s > 50 : 7.72 + (s-50) * 0.18          // → clamp at MAX_SPEED (~stage 52)
```
**Within-stage speed** (accelerates as you near the goal): `speed = min(8, startSpeed · (1 + rampMax · p))`, `p = score/tileGoal` (0→1), `rampMax = 0.30 if s ≤ 10 else 0.66`.

**Hazard appear chance** — `q(s)`:
```
s ≤ 20 : 0.05 + (s-1) * (0.09/19)      // 0.05 → 0.14
20<s≤50: 0.14                           // FLAT
s > 50 : min(0.17, 0.14 + (s-50)*0.002) // gentle creep to the 0.17 cap (~stage 65)
```
**Hazards per row ≈ 5.5 · q/(1+q).**

---

## 2. Master curve (per stage)

| Stage | Tile goal | Start spd | End spd | Start RT | End RT | q | Realised % | Haz/row | New this stage |
|------:|----------:|----------:|--------:|---------:|-------:|----:|-----------:|--------:|----------------|
| 1  | 20  | 2.50 | 3.25 | 400 ms | 308 ms | 5.0% | 4.8% | 0.26 | box only · 7-row runway |
| 2  | 40  | 2.59 | 3.37 | 386 ms | 297 ms | 5.5% | 5.2% | 0.29 | **+ holes** |
| 3  | 55  | 2.67 | 3.47 | 374 ms | 288 ms | 5.9% | 5.6% | 0.31 | **+ boulders, lava, spikes** |
| 4  | 65  | 2.76 | 3.59 | 362 ms | 279 ms | 6.4% | 6.0% | 0.33 | **+ walls, + portals** |
| 5  | 75  | 2.84 | 3.69 | 352 ms | 271 ms | 6.9% | 6.5% | 0.36 | **+ 2×2 crate-piles** |
| 6  | 85  | 2.93 | 3.81 | 341 ms | 263 ms | 7.3% | 6.8% | 0.38 | — |
| 7  | 95  | 3.01 | 3.92 | 332 ms | 256 ms | 7.8% | 7.2% | 0.40 | — |
| 8  | 105 | 3.10 | 4.03 | 323 ms | 248 ms | 8.3% | 7.6% | 0.42 | — |
| 9  | 115 | 3.18 | 4.14 | 314 ms | 242 ms | 8.8% | 8.1% | 0.44 | — |
| 10 | 125 | 3.27 | 4.25 | 306 ms | 235 ms | 9.3% | 8.5% | 0.47 | **+ Liberty Cats** |
| 11 | 135 | 3.35 | **5.56** | 299 ms | **180 ms** | 9.7% | 8.9% | 0.49 | ⚠ **ramp knee 0.30 → 0.66** |
| 12 | 145 | 3.44 | 5.71 | 291 ms | 175 ms | 10.2% | 9.3% | 0.51 | — |
| 13 | 155 | 3.52 | 5.85 | 284 ms | 171 ms | 10.7% | 9.7% | 0.53 | — |
| 14 | 165 | 3.61 | 5.99 | 277 ms | 167 ms | 11.2% | 10.0% | 0.55 | — |
| 15 | 175 | 3.69 | 6.13 | 271 ms | 163 ms | 11.6% | 10.4% | 0.57 | — |
| 20 | 225 | 4.12 | 6.84 | 243 ms | 146 ms | **14.0%** | 12.3% | 0.68 | ← old **stage-10** speed; end of early ramp |
| 25 | 275 | 4.72 | 7.84 | 212 ms | 128 ms | 14.0% | 12.3% | 0.68 | — |
| 26 | 285 | 4.84 | **8.00** | 207 ms | **125 ms** | 14.0% | 12.3% | 0.68 | ⚠ **end-of-stage speed hits cap** |
| 30 | 325 | 5.32 | 8.00 | 188 ms | 125 ms | 14.0% | 12.3% | 0.68 | — |
| 40 | 425 | 6.52 | 8.00 | 153 ms | 125 ms | 14.0% | 12.3% | 0.68 | — |
| 50 | 525 | 7.72 | 8.00 | 130 ms | 125 ms | 14.0% | 12.3% | 0.68 | ← old **stage-30** profile; end of mid ramp |
| 52 | 545 | **8.00** | 8.00 | **125 ms** | 125 ms | 14.4% | 12.6% | 0.69 | ⚠ **start speed hits cap**; hazard creep begins |
| 60 | 625 | 8.00 | 8.00 | 125 ms | 125 ms | 16.0% | 13.8% | 0.76 | — |
| 65 | 675 | 8.00 | 8.00 | 125 ms | 125 ms | **17.0%** | 14.5% | 0.80 | hazard at **17% cap** (flat beyond) |

*Tile goal = `tilesToClear`: 20, 40, then `55 + (s−3)·10`.*

---

## 3. Obstacles per viewport

The ball sits at **64%** down the screen, so **rows visible ahead** ≈ `(h·0.64)/halfH` (`useEpicArt` geometry):

| Viewport | Rows visible ahead |
|---|---|
| Landscape 1280×720 | ~10 rows |
| Portrait 414×896 (phone) | ~25 rows |

**Obstacles on screen ahead** ≈ `haz/row × rows-ahead`:

| Stage | Haz/row | Landscape (~10) | Portrait (~25) |
|------:|--------:|----------------:|---------------:|
| 1  | 0.26 | ~3 | ~6  |
| 5  | 0.36 | ~4 | ~9  |
| 10 | 0.47 | ~5 | ~12 |
| 20 | 0.68 | ~7 | **~17** |
| 30 | 0.68 | ~7 | ~17 |
| 50 | 0.68 | ~7 | ~17 |
| 65+ | 0.80 | ~8 | ~20 |

**Key takeaways:** obstacle count is **flat from stage 20 to 50** (only speed rises there), and the whole field is **noticeably sparser than before the rebalance** — mid-game portrait went from ~21 obstacles on screen to ~17, and the far-late-game cap from ~27 to ~20. **Portrait still shows ~2.5× more obstacles than landscape** for the same stage.

---

## 4. Where it gets significantly harder (spike callouts)

1. **Stage 2–3 — variety explosion.** box → +holes (2) → +boulders/lava/spikes (3). The *kinds* of threat triple in two stages. Steepest *learning* spike; density is still very low (~5–6%).
2. **Stage 11 — the acceleration knee.** Within-stage ramp leaps `0.30 → 0.66`; end-of-stage speed jumps **4.25 → 5.56** and end reaction time drops **235 ms → 180 ms**. The biggest single *speed* spike (was stage 6 pre-rebalance — now later and gentler).
3. **Stage 20 — the old "stage 10" milestone.** Start 4.12 / end 6.84, but at only **14% q** (~12.3% of cells) vs the old 18%. This is where the early ramp ends and the steeper mid-ramp begins.
4. **Stage 26 — end speed pinned to MAX (8.0).** The within-stage acceleration stops adding past here; the late part of every stage is now maximally twitchy (125 ms/tile).
5. **Stage 52 — start speed pinned to MAX.** Whole stage runs at the 8.0 cap; from here there is **no speed progression** — only the tiny hazard creep.
6. **Stage 52→65 — gentle obstacle creep.** q rises 14% → 17% (+0.2%/stage, capped at stage 65). Adds ~3 more on-screen obstacles in portrait, then flat forever.

**Summary:** front-loaded *learning* (st. 1–5, very sparse) → one speed knee (st. 11) → steady speed climb at low density (st. 12–25) → speed saturates (st. 26, fully at st. 52) → a slow, capped hazard drizzle to 17% (st. 52–65). After ~stage 52 only run **length** (tile goal +10/stage) and the small density creep change. Compared to before the rebalance, every difficulty milestone arrives ~2× later and the obstacle ceiling is meaningfully lower.

---

## 5. Difficulty relief (counter-forces, not in the tables above)

These *reduce* the effective numbers — why a stuck player isn't permanently walled:

- **Early rubber band (stages 1–3):** each death lowers that stage's tile goal −10%, down to a −50% floor.
- **Late rubber band (stage 10+):** each death on the stage thins obstacles **−5%** (cap **−35%**) *and* slows the ball **−2%** (cap **−20%**); both reset on clearing the stage.
- **Difficulty setting:** Easy ×0.8 speed, Hard ×1.1 speed.
- **First-ever run:** ×0.8 speed and ×0.5 hazard density, +10 runway rows.
- **Endless mode:** ×0.9 hazard density and its own gentler time-based speed ramp.
- **Power-ups / pickups:** Slow-mo ×0.5 speed, post-teleport ×0.2 speed (transient); the Racer pickup auto-pilots a safe sprint.

---

*Generated from code constants; if any constant above changes, regenerate this table.*
