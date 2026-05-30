# Epicancer — Retention & Conversion Roadmap

A backlog of future features aimed at four levers: **Day-1 retention**, **average
playtime / session length**, **easy-to-pick-up / hard-to-put-down feel**, and
**new-player → engaged/paying conversion**. Each item lists the target metric, the
idea, and a concrete, codebase-aware implementation suggestion. Ordered roughly by
impact-to-effort. Nothing here is committed — cherry-pick what you value.

Legend: 🟢 small (hours) · 🟡 medium (1–2 days) · 🔴 large (multi-day)

---

## A. First-session hooks (Day-1 retention)

### 1. 🟢 First-run guided tutorial overlay
**Lever:** Day-1 retention, easy-to-pick-up.
Brand-new players currently get the `startSubhint` line only. Add a 2–3 step
coachmark on the very first run: "Tap to flip direction" → highlight a gap →
"Dodge the holes" → first item box "Grab power-ups!". Gate on a `tutorialSeen`
flag in the save blob.
**Impl:** new `useOnboarding.ts` + a lightweight `<Coachmark>` overlay in
`EpicancerScene.vue`; pause `step()` via the existing `isGamePaused` gate while a
coachmark is up.

### 2. 🟢 "Almost!" near-miss + best-tile ghost line
**Lever:** hard-to-put-down.
On a loss, show how close they were to clearing ("You needed 3 more tiles!") and
render a faint marker at their personal-best tile depth so every run has a visible
target to beat.
**Impl:** lose screen already shows tiles; add the delta + read `bestScore` from
`useEpicProgress`. Ghost line is one `drawScene` pass in `useEpicArt`.

### 3. 🟡 Instant restart / one-tap retry
**Lever:** average playtime, hard-to-put-down.
The fastest way to grow sessions in arcade games is to shrink the gap between
death and next attempt. Add a prominent "Retry" that skips straight back to
`begin()` without closing/reopening the result modal, and make `Space`/tap
re-launch from the lose screen.
**Impl:** `onResultContinue` already does `resetForStage()`; add a retry path that
also auto-`begin()`s, and bind it to the existing key handler.

### 4. 🟡 Daily first-win bonus / streak escalation
**Lever:** Day-1 + Day-N retention, conversion.
`DailyRewards` exists; layer a "first clear of the day = 2× coins" and an
escalating login streak (day 7 = a free skin or Second Chance). Visible streak
counter on the menu creates a return reason.
**Impl:** extend `useDailyRewards`/`DailyRewards.vue`; reuse the coin-explosion
and `armStartSecondChance` paths.

---

## B. Session-length / playtime

### 5. 🟡 Endless "just one more" mode after the campaign
**Lever:** average playtime.
Once a player clears their current frontier, offer an Endless run scored on tiles
with its own leaderboard, so skilled players aren't capped by stage pacing.
**Impl:** a phase variant in `useEpicGame` that ignores `stageTarget` and ramps
density/speed via the existing `stageHazardChance`/speed curve.

### 6. 🟡 Combo / coin-multiplier chain
**Lever:** hard-to-put-down, playtime.
Reward clean play: consecutive coins or near-misses build a multiplier that
resets on hit. Shows a rising "x2 x3" on the HUD — a classic dopamine loop.
**Impl:** add a `combo` ref to `useEpicGame`, surface in a HUD badge, fold into
`collectCoin`/`awardInstantCoins`.

### 7. 🟢 Mid-run rescue economy tuning
**Lever:** playtime, conversion.
The Second-Chance / rewarded-revive already exists. A/B the cooldown and offer a
*coin* revive as well as the ad revive, so non-ad-watchers also extend runs.
**Impl:** parameterise `SECOND_CHANCE_COOLDOWN` in `EpicancerScene.vue`; add a
coin-priced revive button next to the ad one.

### 8. 🔴 Weekly rotating challenge / mutator
**Lever:** Day-N retention, playtime.
"This week: double lava, half gaps, 3× coins." A single seeded mutator gives
veterans a fresh reason to log in.
**Impl:** a `mutators` table feeding `genRow`/`hazardPool` weights; seed by ISO
week so all players share it (no backend needed).

---

## C. Easy-to-pick-up

### 9. 🟢 Difficulty-aware onboarding default
**Lever:** easy-to-pick-up, Day-1.
The new Easy/Medium/Hard setting exists. Nudge first-time players toward Easy for
stage 1–3 (or auto-suggest Easy after N early losses, complementing the new
rubber-band).
**Impl:** read fail counts (already tracked for the rubber band) and surface a
one-time "Try Easy?" prompt.

### 10. 🟢 Clearer power-up telegraphing
**Lever:** easy-to-pick-up.
Power-ups read as generic boxes. Add a small icon/colour on the item box hinting
what it grants, and a short banner on pickup (the `PowerupBanner` exists — make
the pickup moment louder with a per-type sting, see sound-todo.md #2).
**Impl:** extend `drawItemBox` with a type glyph; pre-roll the type at spawn in
`genRow`.

### 11. 🟡 Readability pass: colour-blind-safe hazards
**Lever:** easy-to-pick-up, accessibility → retention.
Holes/lava/obstacles rely partly on colour. Add distinct silhouettes/patterns and
a colour-blind toggle in Options.
**Impl:** alternate sprite tints/outlines in `useEpicArt`; new `userColorBlind`
setting in `useUser` like the difficulty one.

---

## D. Hard-to-put-down / progression depth

### 12. 🟡 Skin collection meta + rarity
**Lever:** conversion, hard-to-put-down.
The new SkinModal sells skins for coins. Add rarity tiers, a "new!" badge,
preview-on-roll, and one premium/ad-locked skin to seed cosmetic desire.
**Impl:** extend the skins catalogue with `rarity`/`source` (coin | ad | streak);
the renderer hook for the active texture already exists.

### 13. 🟡 Achievements / milestone quests
**Lever:** Day-N retention, playtime.
"Travel 500 lifetime tiles", "Clear stage 5 on Hard", "Destroy 50 boxes". Each
grants coins — turns incidental play into goals.
**Impl:** a `useAchievements.ts` counting off existing events
(`recordScore`, obstacle-destroy, stage clears); claim UI modeled on
`BattlePass.vue`.

### 14. 🔴 Social leaderboard + ghost replays
**Lever:** hard-to-put-down, conversion.
Friend/global leaderboards (the platform SDKs expose score posting; `gamesPlayedTotal`/
`maxStageReached` are already published). Add an asynchronous "beat this run" ghost.
**Impl:** post `bestScore` via the existing platform plugins; ghost = recorded
tap timestamps replayed against the same seed.

### 15. 🟢 Battle Pass season framing
**Lever:** Day-N retention, conversion.
`BattlePass` exists; give it a visible season timer + a free *and* premium track
so there's a paid conversion path and a recurring "season ending soon" hook.
**Impl:** add `seasonEndsAt` + a premium-track flag to `useBattlePass`; gate
premium rewards behind a single IAP/ad-bundle.

---

## E. Conversion (new player → engaged / paying)

### 16. 🟢 Rewarded-ad value clarity
**Lever:** conversion.
Surface what each rewarded ad gives *before* the watch (e.g. "+125 coins",
"revive", "Second Chance") with a consistent movie icon — already partly done;
unify copy and placement so the value prop is obvious.
**Impl:** centralise rewarded-CTA labels in i18n; reuse `AdRewardButton`.

### 17. 🟡 Starter pack / first-purchase nudge
**Lever:** conversion.
After the player's first few stages, offer a one-time high-value coin+skin bundle
("Starter Pack — 70% off") to convert engaged free users.
**Impl:** trigger off `gamesPlayed`/`maxStage` thresholds; a dedicated modal
reusing the SkinModal/Upgrades buy flow.

### 18. 🟢 Coin-sink visibility ("what's next to buy")
**Lever:** conversion, hard-to-put-down.
On the result screen, show the cheapest affordable-soon upgrade/skin ("180 coins
to Magnet Range Lv.2") so coins always feel one run away from a goal.
**Impl:** compute the nearest target from `UPGRADES`/skins vs `coins` in
`EpicancerScene.vue`.

---

## Quick wins to do first
1, 2, 3, 10, 16, 18 are all 🟢 and hit every lever — strongest opening batch.
Then 4, 6, 9, 12, 13 for depth. Save 8, 14 (need seasonal/backend-ish plumbing)
for when the core loop metrics justify them.
