# Epicancer — Growth & Retention Roadmap

Prioritised, actionable feature backlog aimed at four levers:
**Day‑1 retention**, **average playtime**, **easy‑to‑pickup / hard‑to‑put‑down**,
and **new‑player conversion**. Each item lists the lever it moves, an
implementation sketch (mapped to the existing architecture), and a rough
effort tag (S/M/L). Ordered roughly by ROI.

> Architecture anchors you already have: single‑blob `epicancer_state`
> (`useEpicState`), `useEpicProgress` (stage/upgrades/metrics), `usePowerups`,
> `useEpicGame` (sim) + `useEpicArt` (render), `useBattlePass`, `DailyRewards`,
> `useAds` (rewarded/interstitial), `SaveManager` cloud sync.

---

### 1. Near‑miss "CLOSE!" feedback & combo multiplier — *playtime, hard‑to‑put‑down* (S)
When the ball passes within 1 tile of a hole/obstacle without a powerup,
flash a "CLOSE!" pip and start a **combo multiplier** that scales the score
gain per clean tile (resets on hit). Drives the "one‑more‑run, I almost had
the x5" loop. Implement in `useEpicGame.onEnterCell` (track `combo`, expose a
reactive ref; render a small combo HUD chip).

### 2. Daily mission triplet — *Day‑1 retention, playtime* (M)
Three rotating daily goals ("collect 120 coins", "survive 90s", "grab 3 item
boxes", "clear stage N"). Show a `MissionsButton` + modal mirroring
`DailyRewards`. Persist under `epic_missions` in the blob. Completion grants
coins + battle‑pass XP. Gives a reason to open the app every day beyond the
login chest.

### 3. Revive‑chain & "save your streak" rewarded loop — *conversion, playtime* (S)
Already have the Second‑Chance rewarded revive. Add an escalating revive cost
curve (1st free via ad, 2nd costs coins, 3rd disabled) and a "you were SO
close to a new best!" hook on the lose screen when `score > bestScore − 10`.
Pure tuning in the scene's death flow; big lift to session length & ad opt‑in.

### 4. Personal‑best ghost & "beat your record" banner — *hard‑to‑put‑down* (M)
Render a faint ghost marker at the player's previous best‑score row line
("PB" flag) that scrolls past; when the live score crosses it, fire a
celebratory VFX + "NEW BEST!". Store `epic_best_score` (already persisted).
Render in `useEpicArt` as a horizontal neon line at the PB row.

### 5. Coin‑doubler "first run of the day" offer — *Day‑1 retention, conversion* (S)
On the first session each day, after the first run's result screen, surface a
one‑tap rewarded "2× today's first reward" with a small confetti. Resets at
local midnight (reuse the `DailyRewards` date logic). Trains the daily‑open +
ad‑watch habit early.

### 6. Cosmetic ball skins + trail shop (coin sink) — *playtime, conversion* (L)
A `SkinShop` modal: buy ball gradients + trail particle colors with coins
(and a couple rewarded‑ad‑unlock or battle‑pass exclusives). Gives coins a
desirable sink (raising perceived value of every pickup) and self‑expression.
`useEpicArt.drawBall` already centralises the ball palette — drive it from an
`epic_active_skin` field.

### 7. Onboarding "first 20 tiles are safe + guided turn" — *conversion* (S)
First‑ever run: extend the safe runway, pop a finger/cursor tap hint exactly
when the first hazard approaches, and slow the initial ramp. Gate on a
`epic_onboarded` flag. Reduces first‑session bounce — the make‑or‑break for D1.

### 8. Difficulty‑adaptive spawn director (rubber‑banding) — *playtime, retention* (M)
Track rolling death cause/positions; if a player dies repeatedly to the same
hazard type early, transiently lower that hazard's spawn weight for their next
few runs. Keeps new players in flow without making experts bored. Extend
`stageHazardChance`/`genRow` with a per‑profile weight read from the blob.

### 9. Endless "Zen / Marathon" mode toggle — *playtime* (M)
Besides the staged campaign, an endless mode with a global leaderboard score
and gentler ramp. Adds a second pillar of session time for players who like
flow over goals. Mostly a config branch in `useEpicGame` (no stage target,
softer `SPEED_RAMP`).

### 10. Leaderboards (platform + friends) — *hard‑to‑put‑down, conversion* (M)
Post `bestScore`/`maxStage` to the portal leaderboard (GamePix already wired
via `gamesPlayedTotal`/`maxStageReached`; add CrazyGames/Yandex submit). A
visible rank + "you passed PlayerX" toast is one of the strongest replay
drivers for arcade titles.

### 11. Streak‑freeze & escalating login chest — *Day‑1/Day‑7 retention* (S)
Daily rewards already escalate; add a one‑time rewarded "streak freeze" so a
missed day doesn't reset the streak, and a 7‑day milestone mega‑chest. Loss
aversion (protecting a streak) is a proven return driver. Extend
`DailyRewards` state.

### 12. Powerup synergy & "lucky drop" telegraph — *hard‑to‑put‑down* (M)
Occasionally an item box visibly previews a "rare" glow (e.g. a longer‑duration
or stacked powerup). Add a small chance of a **double‑duration** drop and a
distinct sparkle. Anticipation of a rare drop pulls players forward. Hook in
`grantItem` + `usePowerups`.

### 13. Stage‑clear "choose your boon" fork — *playtime, conversion* (M)
On each stage clear, offer a pick‑1‑of‑3 temporary boon for the next stage
(e.g. "+1 free revive", "start with a powerup", "2× coins this stage"). Run‑
based meta‑choices add depth and a natural rewarded‑ad reroll. New modal +
transient flags consumed by `useEpicGame`.

### 14. Juicier moment‑to‑moment feedback pass — *hard‑to‑put‑down* (S)
Layered polish: tile "settle" bounce as the ball lands, speed‑lines at high
velocity, subtle chromatic pulse on powerup pickup, haptics
(`navigator.vibrate`) on hit/clear for mobile, dynamic music intensity tied to
`game.speed`. All in `useEpicArt` + `useSound`; cheap, high felt‑quality.

### 15. Push‑style re‑engagement hooks (where supported) — *retention* (M)
On platforms that allow it (PWA / native), schedule "your daily chest is
ready" and "your battle‑pass season ends in 2 days" nudges. Web‑only fallback:
an in‑app "come back tomorrow for +N" teaser on exit. Wire to existing
`DailyRewards`/`useBattlePass` season timers.

### 16. Tutorialised upgrade spotlight — *conversion, playtime* (S)
First time the player can afford an upgrade, spotlight the Upgrades button
(dim + arrow, like the reused HUD patterns). Teaches the coin→power loop that
converts a one‑session player into a progression‑driven returner. Gate on a
`epic_upgrade_spotlight_seen` flag.

### 17. "Rescue magnet" end‑of‑run coin sweep — *conversion* (S)
On death, briefly auto‑magnet any coins still on screen into the run total
(visible sweep), then offer the 2× rewarded. Makes the reward feel earned and
larger, lifting rewarded‑ad opt‑in. Small addition to the death sequence +
`useEpicArt` sweep VFX.

### 18. Weekly event stages with modifiers — *retention, playtime* (L)
Time‑boxed stages with a twist (mirror controls, fog, gravity‑coins) and a
dedicated reward track. Creates appointment play and fresh content without new
core code — modifiers are flags consumed by `useEpicGame`/`useEpicArt`.

---

## Suggested sequencing
- **Sprint 1 (retention + flow basics):** 7, 1, 14, 16, 5
- **Sprint 2 (habit + conversion):** 2, 11, 3, 17, 10
- **Sprint 3 (depth + freshness):** 4, 12, 13, 6
- **Sprint 4 (modes + events):** 9, 8, 18, 15

## Measurement
Instrument (dev‑only event names, exempt from i18n): `run_start`, `run_end`
(cause, score, stage, duration), `revive_offered/_taken`, `item_collected`,
`upgrade_bought`, `daily_claimed`, `twox_taken`, `stage_cleared`. Watch D1/D7
retention, median session length, runs‑per‑session, and rewarded‑ad opt‑in
rate as the north‑star metrics for the items above.
