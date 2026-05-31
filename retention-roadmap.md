# Epicancer — Retention & Conversion Roadmap

A backlog of future features aimed at four levers: **Day-1 retention**, **average
playtime / session length**, **easy-to-pick-up / hard-to-put-down feel**, and
**new-player → engaged/paying conversion**. Each item lists the target metric, the
idea, and a concrete, codebase-aware implementation suggestion. Ordered roughly by
impact-to-effort. Nothing here is committed — cherry-pick what you value.

Legend: 🟢 small (hours) · 🟡 medium (1–2 days) · 🔴 large (multi-day)

---

## A. First-session hooks (Day-1 retention)

### 2. 🟢 "Almost!" near-miss + best-tile ghost line  (next)
**Lever:** hard-to-put-down.
On a loss, show how close they were to clearing ("You needed 3 more tiles!")
**Impl:** lose screen already shows tiles; add the delta + read `bestScore` from
`useEpicProgress`. Ghost line is one `drawScene` pass in `useEpicArt`.

### 3. 🟡 Instant restart / one-tap retry  (next)
**Lever:** average playtime, hard-to-put-down.
The fastest way to grow sessions in arcade games is to shrink the gap between
death and next attempt. Add a prominent "Retry" that skips from the "ContinueModal" that offers a revive 
straight back to
`begin()` without closing/reopening the result modal.
**Impl:** `onResultContinue` already does `resetForStage()`; add a retry path that
also auto-`begin()`s, and bind it to the existing key handler.


---

## B. Session-length / playtime

### 6. 🟡 Combo / coin-multiplier chain (next)
**Lever:** hard-to-put-down, playtime.
Reward clean play: consecutive coins collection(within 4 seconds of last pickup) build a multiplier that
resets on hit or after 4 seconds without coin collection. Shows a rising "x2 x3" on the HUD — a classic dopamine loop.
Rises by 0.05x per freely placed coin(destroying obstacles dont count to this combo) in the loop up to a 3x reward(golden color, 2x is displayed in fancy orangish color).
**Impl:** add a `combo` ref to `useEpicGame`, surface in a HUD badge, fold into
`collectCoin`/`awardInstantCoins`.

### 7. 🟢 Mid-run rescue economy tuning
**Lever:** playtime, conversion.
The Second-Chance / rewarded-revive already exists. A/B the cooldown and offer a
*coin* revive as well as the ad revive, so non-ad-watchers also extend runs.
**Impl:** parameterise `SECOND_CHANCE_COOLDOWN` in `EpicancerScene.vue`; add a
coin-priced revive button next to the ad one.

---

## C. Easy-to-pick-up

### 9. 🟢 Difficulty-aware onboarding default
**Lever:** easy-to-pick-up, Day-1.
The new Easy/Medium/Hard setting exists. Nudge first-time players toward Easy for
stage 1–3 (or auto-suggest Easy after N early losses, complementing the new
rubber-band).
**Impl:** read fail counts (already tracked for the rubber band) and surface a
one-time "Try Easy?" prompt.

---

## D. Hard-to-put-down / progression depth

### 12. 🟡 Skin collection meta + rarity  (next)
**Lever:** conversion, hard-to-put-down.
The new SkinModal sells skins for coins. Add rarity tiers, a "new!" badge,
preview-on-roll, and one premium/ad-locked skin to seed cosmetic desire.
**Impl:** extend the skins catalogue with `rarity`/`source` (coin | ad | streak);
the renderer hook for the active texture already exists.
Lock rare skins behind an stage progression lock(Lock symbol and grey overlay with ~60% opacity).


### 13. 🟡 Achievements / milestone quests  (next)
**Lever:** Day-N retention, playtime.
"Travel 500 lifetime tiles", "Clear stage 5 on Hard", "Destroy 50 boxes". Each
grants coins — turns incidental play into goals.
**Impl:** a `useAchievements.ts` counting off existing events
(`recordScore`, obstacle-destroy, stage clears); claim UI modeled on
`BattlePass.vue`.

---

## E. Conversion (new player → engaged / paying)

### 16. 🟢 Rewarded-ad value clarity  (next)
**Lever:** conversion.
Surface what each rewarded ad gives *before* the watch (e.g. "+125 coins",
"revive", "Second Chance") with a consistent movie icon — already partly done;
unify copy and placement so the value prop is obvious.
**Impl:** centralise rewarded-CTA labels in i18n; reuse `AdRewardButton`.

---

## Quick wins to do first
1, 2, 3, 10, 16, 18 are all 🟢 and hit every lever — strongest opening batch.
Then 4, 6, 9, 12, 13 for depth. Save 8, 14 (need seasonal/backend-ish plumbing)
for when the core loop metrics justify them.
