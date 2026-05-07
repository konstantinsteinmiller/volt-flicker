# Maw-It-Down — Retention & Conversion Roadmap

Ordered by expected lift on the four core metrics: Day-1 retention,
average playtime, easy-to-pickup-hard-to-put-down feel, and conversion.
Every item lists what to ship and where to start in the codebase.

## Day-1 retention

1. **Variable-difficulty first session.**
   The first three stages should be auto-tuned to the player's competence
   so the first 90 seconds feel "I just barely won, one more." In
   `useMawCampaign.ts`, gate `targetClears` and `chainLength` on
   `gamesPlayed` (already tracked in `useMawProgress`) so a struggling
   player gets shorter goals and a fast learner gets a stretch chain.

2. **First-coin instant gratification.**
   Spawn a guaranteed cluster of 5 coins inside the home island so the
   coin explosion and CoinBadge fly-to-VFX fires within the first 3
   seconds of a fresh session. Drop them in `useMawCampaign.buildStage`
   for stage 1 only. Hooks the player on the satisfaction loop before
   the first death.

3. **Day 1 → Day 2 push notification cadence.**
   The DailyRewards 7-day track is already wired; add a calendar-day
   countdown overlay on first session-end that shows "Come back in
   16h for a 100-coin bonus." Implementation: add a side-effect into
   `DailyRewards.vue.onClaim` that schedules a Web Notification (and
   a CrazyGames `gamePush` on supported portals).

4. **Three-tap startup.**
   Today the splash → menu → meteor countdown → playable is ~6s. Cut
   the meteor intro to 1 cycle on Day-1 sessions (detect via
   `gamesPlayed === 0`). Implement in `MawScene.beginPlay` by
   shrinking the meteor count when `gamesPlayed` is 0.

## Average playtime

5. **Endless mode after stage 30.**
   Currently caps at the 30 hand-tuned stages. Add an endless cycle
   that rerolls procedurally via `STAGES[(id - 1) % 30]` and bumps
   `targetClears` & boulder counts each loop. Update
   `useMawCampaign.advanceStage` to wrap, and surface the cycle suffix
   on the StageBadge.

6. **Stage objectives variety.**
   Right now every stage is "maw N blades." Layer in alternates:
   - "Survive 60 seconds without taking damage"
   - "Cut 5 stumps" (after the saw upgrade)
   - "Don't anchor on the home island"
   Add an `objective` field to `MawStage` and randomly assign per
   non-boss stage; update `useMawGame.tick` win check accordingly.

7. **Daily challenge.**
   One curated stage seed per UTC day, broadcast via shared seed in
   `useMawCampaign`. Beating it grants a one-shot 250-coin bonus
   tracked in a new `spinner_daily_challenge` key. Surface as a banner
   on the StageBadge area and a new tab in DailyRewards modal.

8. **Combo system.**
   Successive blades cut without the swing leaving an island stack a
   `combo` multiplier visible on the HUD; coin payout scales 1× → 3×.
   Implement in `useMawGame.tick`: increment a `combo` ref on every
   grass cut, decay 0.5/s, persist `bestCombo` to push to leaderboard.

## Easy-to-pickup, hard-to-put-down

9. **Ghost replay of the player's last best run.**
   Record the anchor-swap timestamps + positions during a stage and
   show a faded second pair of gears on the next attempt. Storing this
   is a thin trail buffer; rendering hooks into `paint()` in
   `MawScene` after the live robot draws.

10. **Tap-to-aim toggle (accessibility / casual mode).**
    Some players will struggle with the timing-only mechanic. Add an
    optional mode where the player drags to set the swing angle and
    releases to anchor — the chain swings to that angle on release.
    Implement as a toggle in OptionsModal; gate in
    `useMawGame.swapAnchor` to use the dragged target instead of the
    live swing position.

11. **Vibration feedback on mobile.**
    `navigator.vibrate(20)` on every coin pickup, `[40, 30, 80]`
    pattern on damage, and a long pulse on death. Wire into
    `useMawGame` callbacks. Players consistently rate
    haptics-enabled web games higher on iOS Safari.

12. **Slow-motion on near-water swap.**
    When the swap-target gear is within 30px of the water edge, drop
    the global tick rate to 0.4× for 250ms. Adds dramatic tension and
    is easy to do via a `timeScale` ref in `useMawGame.tick`.

## Conversion (rewarded ads, IAP, season pass)

13. **Continue-on-watch.**
    On `lose`, instead of FReward → onContinue, show a "Watch ad to
    keep your stage progress" CTA. Restores `life` to 1 and resumes
    the same stage with the chain at the last safe anchor. Impl: in
    `MawScene.onContinue`, branch on `gameResult === 'lose'` and call
    `showRewardedAd()`; on success, reset `phase = 'playing'` without
    re-initing the stage.

14. **Coin doubler.**
    A "2× coins for next 5 minutes" rewarded-ad reward that stacks on
    BattlePass + DailyRewards rewards. Persist expiry to localStorage,
    apply a multiplier inside `useMawConfig.addCoins` so every coin
    source benefits.

15. **Seasonal cosmetics — chain skins + gear skins.**
    The robot is three art layers (anchor gear, swing gear, chain).
    Ship a SkinChestTimer (already-deleted from chaos-arena, easy to
    reintroduce) that grants new visual variants. Lots of perceived
    value at near-zero gameplay risk because the silhouette is
    unchanged.

16. **Battle Pass premium tier.**
    Today the BattlePass is single-track (free coins). Add a "Premium"
    track unlocked via a single in-app purchase that doubles every
    coin reward and grants exclusive cosmetics. Add a `isPremium`
    flag to the BP state and a paywall on the modal.

17. **Stage Pass.**
    A "skip this stage for 50 coins / watch ad" button on a 3rd
    consecutive death of the same stage. Tracks the deathstreak in
    `useMawGame`, pops a small banner. Avoids churn from a single
    spike-difficulty stage.

18. **Friction-free first ad.**
    The first rewarded video offer is queued automatically after stage
    2 so the player learns the loop ("watch → coins → upgrade") before
    they hit a frustration wall. Hook into `useMawCampaign.advanceStage`
    when `currentStageId === 3 && gamesPlayed < 5`.

## Engineering hygiene (parallel)

19. **Wire CrazyGames `gameplayStart` / `gameplayStop` per stage.**
    Already imported in MawScene; add a watcher on `phase` so the SDK
    sees correct gameplay windows for ad-pacing telemetry.

20. **Replace programmatic art with the assets shipped in `art-todo.md`.**
    Each replacement shrinks the JS bundle (the procedural drawing is
    cheap CPU but not zero) and crushes paint cost on low-end Android.
