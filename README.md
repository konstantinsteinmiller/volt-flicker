# Maw It Down

A 2D top-down platformer where the player drives a two-gear robot connected
by a spike chain. Anchor one gear, swing the other, and time taps to leap
between islands while mawing grass, wheat, and flowers for coins. Built on
the same Vue 3 + Vite + Pug + Tailwind + SASS stack as `chaos-arena` and
ships with the same multi-platform integrations (CrazyGames, GameDistribution,
Glitch, itch, Wavedash) plus a portable `SaveManager` cloud-save layer.

## Getting started

```bash
pnpm install
pnpm dev          # local dev server
pnpm test         # unit tests (Vitest)
pnpm build        # default web build
pnpm build:crazy-web
pnpm build:game-distribution
pnpm build:glitch
pnpm build:itch
pnpm build:wavedash
```

Per-platform `.env.<platform>` files are stubbed with the keys you need to
fill before deploying (`VITE_GAME_DISTRIBUTION_GAME_ID`, the Glitch install
ids, etc.).

## Code map

- `src/views/MawScene.vue` — the only gameplay view. Mounts the canvas,
  the HUD, and every modal.
- `src/use/useMawGame.ts` — anchor/swing physics, chain hit-test, win/lose.
- `src/use/useMawCampaign.ts` — stages and biomes, persisted progression.
- `src/use/useMawProgress.ts` — upgrades + achievements + life storage.
- `src/use/useMawArt.ts` — programmatic Canvas2D drawing for gears, chain,
  islands, water, obstacles, coins.
- `src/use/useMeteorIntro.ts` — meteor shower + 3-2-1-Go countdown.
- `src/use/useBattlePass.ts` — 30-stage battle pass (coin rewards only).
- `src/components/organisms/AchievementsModal.vue`
  + `UpgradesModal.vue` — bottom-right UI.
- `src/utils/save/` — the chaos-arena `SaveManager` ported wholesale.

## Mechanics in one paragraph

Two gears, fixed-length chain. One gear is the **anchor** (rooted) and the
other **swings** at the chain length around it at a constant angular speed.
Tap or click anywhere to swap which gear is the anchor — the swinger's
current world position becomes the new anchor and the previous anchor
becomes the new swinger. If the new anchor lands over open water, you
splash. Stumps cost 1 life, boulders cost 2. Saw upgrades let you cut
stumps. Maw enough grass to clear the stage.

## Documentation

- `art-todo.md` — programmatic-art replacement queue.
- `roadmap.md` — 20 retention / playtime / conversion bets prioritised by
  expected impact, with file pointers for each.
