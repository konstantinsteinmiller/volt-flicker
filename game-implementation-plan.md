# Epicrolla — Game Implementation Plan

> A mobile-first 2D arcade survival game. A ball rolls diagonally **upward**
> across an isometric diamond grid. Each tap/click flips the horizontal
> heading (NE ⇄ NW). Survive as long as possible while roll speed ramps up.
> Score = number of grid tiles entered. Built on the existing Epicrolla /
> epicrolla multi-platform Vue 3 + Vite + TS + Pug + Tailwind + SASS stack.

This document is the **source of truth** for the build. If a session is
interrupted, resume from the first unchecked item in "Execution Phases".

---

## 1. Reused infrastructure (DO NOT rebuild)

The repo already ships a battle-tested platform layer. We **keep and reuse**:

| System | File(s) | Notes |
|---|---|---|
| Single-blob state | `use/useMawState.ts` → renamed `useEpicState.ts` | One localStorage key. Rename `STATE_KEY` → `epicrolla_state`. |
| Save / cloud sync | `utils/save/*`, `SaveManager`, `BlobStorage`, `SaveMergePolicy` | Mirrors exactly the state blob + `__save_meta__`. |
| Platform builds | `platforms/*`, `.env.*`, `main.ts` boot | CrazyGames, GameDistribution, Glitch, Itch, Wavedash, GamePix, Playgama, GameMonetize, Yandex. |
| Ads | `use/useAds.ts`, `use/ads/*`, `use/useRewardedThrottle.ts` | `showRewardedAd`, `showMidgameAd`, `isRewardedReady`, `isInterstitialReady`, `isAdsBlocked`. |
| Pause gate | `use/useGamePause.ts`, `use/useGamePauseAudio.ts` | `isGamePaused`, `acquireAppPause`. Renderer early-returns on pause. |
| Sound | `use/useSound.ts`, `use/useAssets.ts`, `use/useSoundPreload.ts` | `useMusic()`, `useSounds().playSound/playRandomVariant/playLoop`. |
| Modal signal | `use/useModalState.ts` | `acquireModalOpen`, `isAnyModalOpen`. |
| Screenshake | `use/useScreenshake.ts` | `triggerShake('small'|'strong'|'big')`, `shakeStyle`. |
| Coin VFX | `use/useCoinExplosion.ts` | `spawnCoinExplosion({ sourceEl, targetEl })`. |
| Coins / progress | `use/useMawConfig.ts` → `useEpicConfig.ts` | `coins`, `addCoins`, `spendCoins`. |
| Battle Pass | `use/useBattlePass.ts`, `organisms/BattlePass.vue` | Already coin-only. Keep. Tune XP. |
| Daily Rewards | `organisms/DailyRewards.vue` | Already coin-only. Keep. |
| i18n | `i18n/*`, 8 locales (`en de fr es jp kr zh ru`) | Replace key bodies. en = source. |
| UI atoms | `FButton`, `FModal`, `FReward`, `FMuteButton`, `FIconButton`, `FTabs`, `FSlider`, `FSwitch`, `FSelect`, `FLogoProgress`, `FPerfMeter`, `CoinBadge`, `IconCoin`, `IconMovie`, `StageBadge`, `OptionsModal`, `AdsBlockedModal`, `SaveStatusBanner` | Make F-components fully responsive (no fixed `scale-110` magic). |
| App shell | `App.vue`, `router/index.ts` | Route `/` → `EpicrollaScene.vue`. Drop `/editor` + LevelEditor. |

### Components/composables to DELETE (Epicrolla gameplay-specific)
`views/MawScene.vue`, `views/LevelEditor.vue`, `use/useMawGame.ts`,
`use/useMawArt.ts`, `use/useMawCampaign.ts`, `use/useMawProgress.ts`,
`use/useMawState.ts`(renamed), `use/useMawConfig.ts`(renamed),
`use/useMawGhost.ts`, `use/useStageBuilder.ts`, `use/useStageMeta.ts`,
`use/useCustomStages.ts`, `use/useIslandShapes.ts`, `use/useMeteorIntro.ts`,
`use/useMeteorShower.ts`, `use/useHint.ts`, `organisms/UpgradesModal.vue`
(rebuilt), `organisms/TreasureChest.vue`, `organisms/SpeedrunButton.vue`,
`organisms/AchievementsModal.vue` + `SpinnerAchievementsModal.vue`(optional),
`atoms/LifeBadge.vue` (replaced by powerup/score HUD), `data/campaign-overrides.json`,
the `mawCampaignOverridesPlugin` in `vite.config.ts`, icons not used.
Keep `AdRewardButton.vue` (rename internals if needed).

---

## 2. Game design spec

### Coordinate system
- **Isometric diamond grid** like the reference screenshot. A logical grid
  cell `(col,row)` maps to screen via:
  - `screenX = originX + (col - row) * (TILE_W/2)`
  - `screenY = originY + (col + row) * (TILE_H/2)` then negated for upward.
- The ball travels **up** the screen → world scrolls **down**. We move a
  `cameraRow` (float) upward over time; rows below scroll off-bottom.
- Ball occupies a continuous position; "entering a new tile" = crossing into
  a new `(col,row)` integer cell. Each new cell entered → `score += 1`.

### Ball movement
- Two diagonal headings: **NE** (`col+`, toward top-right) and **NW**
  (`row+`… actually `col-`, toward top-left). Both advance "up".
- Heading flips on tap/click/Space. Movement is continuous at `speed`
  cells/second along the current diagonal; vertical (upward) progress is the
  sum so both diagonals climb.
- `speed` starts at `BASE_SPEED` and ramps: `speed = BASE_SPEED * (1 + elapsed * SPEED_RAMP)` capped at `MAX_SPEED`. Slow-Motion powerup multiplies by 0.5.

### Grid content
- Tiles textured from `public/images/props/grid-tile-1..5.webp` (normal,
  random/checker pattern) and `grid-tile-special-1..3.webp` (accent tiles).
  Rotate per iso orientation as needed.
- **Floor holes**: sparse tiles flagged as holes (no floor). Falling in = death
  (unless Invulnerable). Visual = dark pit tile.
- **Coins**: random tiles spawn a coin; rolling over collects it (coin shrinks
  + flies into the ball — short suck animation). Magnet powerup auto-collects
  in viewport.
- **Obstacles**: boxes, pyramids, stone boulders, walls placed on tiles.
  Collision = run over → ball pops (VFX) → death. Push-Force powerup shoves
  small obstacles (box/stone) aside so no collision.
- **Item boxes** (Mario-Kart style): 1 spawns every 50 tiles of score, on a
  tile in the top-most spawned row. Rolling over → grants a random powerup
  and shows a quick pick animation.

### Powerups (timed; base durations, upgradable)
| Name | Base | Effect |
|---|---|---|
| Invulnerable Mode | 6s | Fly over holes + ignore obstacles. Ball glows bright yellow (star). |
| Coin Magnet | 6s | Auto-collect all coins within viewport distance. |
| Dodge Master | 5s | Auto-dodges obstacles & holes (auto-flips heading to avoid). |
| Slow Motion | 5s | Speed ×0.5; easier collection/evasion. |
| Push Force | 6s | Pushes small obstacles away; ball never collides with boxes/stones. |

Only one powerup active at a time (new pickup replaces/extends). Active
powerup shown as a labeled timer banner near bottom (ref: "INVINCIBLE" bar).

### Stages
- Stage 1 target = **200 tiles**; each next stage target = previous + **100**
  (300, 400, …). Reaching target = **Win** (stage clear) → Win screen, then
  continue to next stage on next run (persist `epic_stage`). StageBadge
  top-left shows current stage.
- Difficulty scales with stage (more obstacles/holes, faster ramp).

### Lose / Win flow
- **Lose** (collision or fall): 500ms delay → mute music/SFX → request
  interstitial (handle adblock via AdsBlockedModal) → resume music. Lose
  screen shows coins collected this run; awards **+12 XP** to Battle Pass; no
  bonus coins beyond what was collected.
- **Second Chance** (MawScene `showContinueOffer` pattern): on death, if
  rewarded ad available AND 30s cooldown elapsed, show modal: "Watch &
  Continue" (rewarded → revive at safe position) or "Skip" → lose screen.
  If not available, skip straight to lose screen.
- **Win**: Win screen with `FReward`, dynamic coin reward = f(tiles travelled,
  time survived), shows coins collected this run, plus battle-pass campaign-win XP.
- **2× coins** rewarded button on BOTH win & lose screens (30s cooldown after use).

### State object — `epicrolla_state` (single in-memory Record, one LS key)
Fields (internal blob keys, `epic_` prefix):
```
epic_stage            number   // current stage (1+)
epic_coins            number   // wallet
epic_best_score       number   // best tiles in a run
epic_upgrades         { levels: Record<string,number> }
epic_powerup_unlocks  ...      // future
spinner_user_language / _sound_volume / _music_volume  // settings (kept keys)
spinner_battle_pass   ...      // BattlePass state (reused composable key)
spinner_daily_rewards ...      // DailyRewards state
spinner_ad_button_ready_at ... // AdRewardButton cooldown
__save_internal__rewarded_history  // throttle (local-only)
__save_meta__         ...      // save merge meta
```
> NOTE: settings + battlepass + daily keys keep their `spinner_` names so the
> reused composables work unchanged; they're just fields inside the one blob.
> `STATE_KEY = 'epicrolla_state'` is the single localStorage/cloud key.

---

## 3. New files to create

```
src/use/useEpicState.ts        // single-blob (was useMawState)
src/use/useEpicConfig.ts       // coins/wallet (was useMawConfig)
src/use/useEpicProgress.ts     // stage, best score, upgrades
src/use/useEpicGame.ts         // core loop, entities, collisions, powerups
src/use/useEpicArt.ts          // canvas drawing: grid, ball, obstacles, coins, vfx
src/use/usePowerups.ts         // powerup registry + active timer
src/views/EpicrollaScene.vue  // main scene + HUD + modals
src/components/atoms/ScoreBadge.vue     // big center score
src/components/atoms/PowerupBanner.vue  // active powerup timer bar
src/components/organisms/EpicUpgradesModal.vue  // powerup upgrades
data/  (drop campaign-overrides)
docs/epicrolla-roadmap.md     // retention roadmap (deliverable)
```

---

## 4. Execution Phases (checklist)

> **STATUS (initial build complete):** P0–P11 done. Production build green
> (type-check + obfuscation, no `.js` pollution), dev server boots clean,
> 242/244 unit tests pass. The 2 failures are **pre-existing, unrelated**
> platform-SDK tests (`gameMonetizeFill` cooldown timer; `GlitchStrategy`
> fetch-fail timeout) — both test files are byte-identical to the original and
> import no Epicrolla code. Cloud‑hydrate is covered by
> `tests/save/EpicStateCloudHydrate.test.ts`; a driven-browser e2e
> (`verify-cloud-save-hydration`) still needs running in an env with the
> Chrome DevTools MCP (not available here). Tuning/art‑swap + the F‑component
> responsive polish (P6) are the natural next polish pass.

- [x] **P0 Rebrand**: package.json (name `epicrolla`, zip names), index.html
  (title, splash text/colors, manifest title, preload logo), manifest.json,
  fonts (only Angry), theme `#`. Remove editor route + vite overrides plugin.
- [ ] **P1 State**: rename `useMawState`→`useEpicState`, `STATE_KEY='epicrolla_state'`,
  strip legacy maw migration (fresh slate, keep generic fold), update
  `SaveMergePolicy` (STATE_KEY import, score formula → stage+upgrades),
  `keys.ts` (`epic_*`), and all importers. Build green.
- [ ] **P2 Engine**: `useEpicState/Config/Progress`, `usePowerups`, `useEpicGame`
  (grid model, ball, scroll, scoring, spawn director, collisions, powerups,
  stage transitions, death/win, second-chance hooks).
- [ ] **P3 Art/VFX**: `useEpicArt` iso renderer (tiles via images w/ vector
  fallback, ball vector w/ glow states, obstacle vectors+image fallback, coin
  sprite + suck anim, ball-pop particles, powerup auras). Hook screenshake.
- [ ] **P4 Scene/HUD**: `EpicrollaScene.vue` — canvas + pointer, ScoreBadge,
  StageBadge, hint, tap-to-start, PowerupBanner, bottom-left mute/settings +
  Daily/AdReward/BattlePass, bottom-right upgrades, second-chance modal,
  win/lose FReward, 2× rewarded. Responsive all viewports + safe-area.
- [ ] **P5 Meta**: tune BattlePass XP (12/attempt), wire awards; DailyRewards;
  EpicUpgradesModal (powerup durations, magnet radius, start speed, extra life?).
- [ ] **P6 F-component responsiveness pass**: remove brittle fixed scales,
  ensure no 0-size collapse, FModal header no overlap.
- [ ] **P7 i18n**: rewrite `en.ts`, propagate to 7 other locales.
- [ ] **P8 Env cleanup**: blank platform keys/ids/title_id/test_install_id.
  `pnpm type-check` + `pnpm build` green.
- [ ] **P9 Tests**: prune Epicrolla gameplay tests, keep save/plugins/battlepass;
  add `useEpicGame`/`useEpicProgress`/`usePowerups`/`useEpicConfig` tests.
- [ ] **P10 Cloud hydration e2e** via Chrome DevTools MCP (`verify-cloud-save-hydration`).
- [ ] **P11 Roadmap**: `docs/epicrolla-roadmap.md`, ≥15 retention features.

## 5. Performance / mobile rules
- Canvas sized to devicePixelRatio-capped; redraw only in RAF; early-return on
  `isGamePaused`. Pre-tessellate tile draw; cache rotated tile images per
  orientation. Object pools for coins/particles. Defer audio + non-critical
  art decode until after first paint (`schedulePreloadOnIdle`). No fixed px;
  size by `vw/vh/%`; honor `env(safe-area-inset-*)`. Images non-selectable,
  pointer-events for canvas only.

## 6. Open defaults (chosen, per "pick recommended")
- One active powerup at a time. Revive cost (coins) optional — primary revive
  is rewarded-ad. Ball pop VFX = programmatic particles until spritesheet
  provided (easy swap via `/public/images` lookup). Dodge Master = auto-flip
  heading + auto-fly toggles. Item box art = vector gift box until asset given.
