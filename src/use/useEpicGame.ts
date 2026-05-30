import { ref, type Ref } from 'vue'
import useSounds from '@/use/useSound'
import { useScreenshake } from '@/use/useScreenshake'
import useEpicProgress, { tilesToClear, upgradedValue } from '@/use/useEpicProgress'
import useBattlePass from '@/use/useBattlePass'
import usePowerups, { type PowerupType } from '@/use/usePowerups'
import { difficultySpeedFactor } from '@/use/useUser'

/**
 * Core game loop for Epicancer.
 *
 * A ball rolls UP an isometric diamond grid, hopping diamond-to-diamond along
 * the diamond edges. Each hop goes one row up and one column left or right; a
 * tap flips the horizontal heading (NE ⇄ NW). The ball bounces off the field's
 * side edges. Score = diamonds entered. Speed ramps over time.
 *
 * The simulation is pure-lattice (integer cell `{c, r}` + a 0..1 `progress`
 * toward the next diamond). All pixel geometry / iso projection lives in the
 * renderer (`useEpicArt`), which reads the exported `game` snapshot. Valid
 * diamonds satisfy `(c + r) even`; the two up-neighbours of `(c, r)` are
 * `(c-1, r-1)` and `(c+1, r-1)`.
 */

export type Phase = 'idle' | 'playing' | 'dead' | 'won'
export type GameResult = '' | 'win' | 'lose'
export type LossCause = '' | 'hole' | 'crash'

export type ObstacleKind = 'box' | 'pyramid' | 'stone' | 'wall' | 'libertyCat'
export type CellKind = 'floor' | 'hole' | 'obstacle' | 'coin' | 'item' | 'portal' | 'lava'

export interface Cell {
  c: number
  r: number
  kind: CellKind
  obstacle?: ObstacleKind
  /** Coin already swallowed (kept for a frame so the renderer can fade it). */
  collected?: boolean
}

export interface FxEvent {
  kind: 'coin' | 'pop' | 'push' | 'item' | 'sparkle' | 'explode' | 'portal' | 'shatter'
  c: number
  r: number
  bornAt: number
  color?: string
  /** For the 'shatter' kind: which obstacle sprite to tear into shards. */
  obstacle?: ObstacleKind
}

// ─── Tunables ───────────────────────────────────────────────────────────────

/** Diamond column span [0, C_MAX]. ~6 diamonds across a row. */
export const C_MAX = 10
const GEN_AHEAD = 22
const CULL_BEHIND = 6

const BASE_SPEED = 2.5          // diamonds / second at the START of a stage
const MAX_SPEED = 8
const STAGE_SPEED_BONUS = 0.18  // extra starting speed per stage

// Within-stage acceleration: the ball speeds up as the player nears the goal.
// Stages 1-5 ramp a gentle +30% over the whole stage (beginner-friendly);
// stage 6+ ramp a steeper +66%.
const EARLY_STAGE_RAMP = 0.30
const LATE_STAGE_RAMP = 0.66

const START_RUNWAY = 7          // rows of guaranteed-safe floor at the start
const SMALL_OBSTACLES: ObstacleKind[] = ['box', 'stone']

/** How long (ms) the ball spends sinking into a hole before death registers.
 *  Read by the renderer to drive the drop visual. */
export const DROP_MS = 420

// ─── Rubber-band difficulty (session-only) ──────────────────────────────────
//
// Strugglers on the first three stages get a gentler goal: each FAILED attempt
// on a stage shaves 10% off that stage's tile target, down to a 50% floor. So a
// player who has lost 4 times on stage 1 only needs 12 tiles (20 × 0.6) to clear
// it. Kept in a module-level Map that is intentionally NOT persisted to
// localStorage/SDK — it resets on reload, which is acceptable.
const RUBBER_BAND_STAGES = 3
const stageFailCounts = new Map<number, number>()

/** Effective tile goal for a stage, applying the first-3-stages rubber band. */
const rubberBandedTarget = (stage: number): number => {
  const base = tilesToClear(stage)
  if (stage > RUBBER_BAND_STAGES) return base
  const fails = stageFailCounts.get(stage) ?? 0
  const factor = Math.max(0.5, 1 - 0.1 * fails) // −10%/fail, floor 50%
  return Math.max(1, Math.round(base * factor))
}

const cellKey = (c: number, r: number): string => `${c},${r}`
const isSmall = (o: ObstacleKind | undefined): boolean => !!o && SMALL_OBSTACLES.includes(o)

// ─── Module-singleton simulation state (read by the renderer) ────────────────

export const game = {
  phase: 'idle' as Phase,
  cells: new Map<string, Cell>(),
  fx: [] as FxEvent[],
  // Ball lattice position
  cell: { c: 4, r: 0 },
  target: { c: 5, r: -1 },
  progress: 0,
  dir: 1 as 1 | -1,
  nextDir: 1 as 1 | -1,
  // Float render position (lerp of cell→target)
  ballC: 4,
  ballR: 0,
  speed: BASE_SPEED,
  clock: 0,            // monotonic game ms (excludes pauses)
  runStartClock: 0,
  // generation frontier (most-negative r generated)
  genR: 0,
  itemSpawned: 0,
  pendingItem: false,
  // Ball is sinking into a hole: freezes movement and drives the drop visual
  // until `dropClock` reaches DROP_MS, at which point death registers.
  dropping: false,
  dropClock: 0,
  // Ball has blown up (obstacle / lava) — the renderer stops drawing it so the
  // explosion FX reads as the ball being destroyed rather than parked.
  exploded: false,
  // Game-clock ms until which post-teleport slow-motion is active. While
  // `clock < teleportSlowUntil` movement is 80% slower and the renderer dims
  // the grid + spotlights the ball so the player can re-orient.
  teleportSlowUntil: 0,
  // Persistent Second Chance pickup: lasts until the stage ends and turns the
  // next obstacle/lava hit into a survivable save instead of death. Gaps (holes)
  // still kill the player.
  secondChance: false,
  // game-clock ms until which the ball blinks (opacity) after spending a chance.
  secondChanceBlinkUntil: 0,
  // Dodge Apprentice cooldown gate: game-clock ms at/after which a dodge is
  // available again. 0 = ready (each run starts with one charge).
  dodgeReadyAt: 0
}

/** Duration (ms) of the post-teleport orientation slow-motion. */
export const TELEPORT_SLOW_MS = 2000
/** Movement speed multiplier while post-teleport slow-mo is active (−80%). */
const TELEPORT_SLOW_FACTOR = 0.2
/** How long (ms) the ball blinks after spending a Second Chance. */
export const SECOND_CHANCE_BLINK_MS = 1600

// ─── Reactive HUD surface ─────────────────────────────────────────────────

const phase: Ref<Phase> = ref('idle')
const score: Ref<number> = ref(0)
const gameResult: Ref<GameResult> = ref('')
const lossCause: Ref<LossCause> = ref('')
const coinsThisRun: Ref<number> = ref(0)
const lastWinReward: Ref<number> = ref(0)
const stageTarget: Ref<number> = ref(tilesToClear(1))
const survivalMs: Ref<number> = ref(0)

const useEpicGame = () => {
  const { playSound, playRandomVariant } = useSounds()
  const { triggerShake } = useScreenshake()
  const progress = useEpicProgress()
  const { awardAttempt } = useBattlePass()
  const powerups = usePowerups()

  const emitFx = (kind: FxEvent['kind'], c: number, r: number, color?: string, obstacle?: ObstacleKind): void => {
    game.fx.push({ kind, c, r, bornAt: game.clock, color, obstacle })
    // Keep the fx list bounded.
    if (game.fx.length > 80) game.fx.splice(0, game.fx.length - 80)
  }

  // Throttle the coin-pickup SFX so a magnet sweep / dense coin run doesn't
  // machine-gun overlapping clips. 150ms min spacing between plays.
  let lastCoinSoundAt = -Infinity
  const playCoinSound = (): void => {
    if (game.clock - lastCoinSoundAt < 150) return
    lastCoinSoundAt = game.clock
    playSound('coin-pickup', 0.05, 1 + (Math.random() - 0.5) * 0.1)
  }

  /** Cooldown (ms) of the Dodge Apprentice passive at a given level: 10s at
   *  level 1, −0.5s per level (max level 10 → 5.5s). */
  const dodgeCooldownMs = (level: number): number => Math.max(0, 10 - (level - 1) * 0.5) * 1000

  /** An obstacle the ball can barrel through instead of dying on:
   *  • the Push Force power-up clears small obstacles (box + stone), and
   *  • the permanent Rolling Boulder upgrade lets it roll through boxes.
   *  Both award coins and shatter the prop (see the obstacle handling below). */
  const isPassableObstacle = (o: ObstacleKind | undefined): boolean =>
    (powerups.isActive('push') && isSmall(o)) ||
    (progress.levelOf('rollingBoulder') > 0 && o === 'box')

  // ─── Procedural generation ────────────────────────────────────────────────

  // Hazard density ramps from very sparse (stage 1, a gentle tutorial) up to the
  // original "stage 1" density at stage 10 — the difficulty test level reachable
  // via the CTRL+SHIFT+ALT+T cheat — then keeps creeping up, capped.
  const stageHazardChance = (): number => {
    const stage = progress.stage.value
    if (stage <= 10) return 0.05 + (stage - 1) * ((0.18 - 0.05) / 9)
    return Math.min(0.42, 0.18 + (stage - 10) * 0.012)
  }

  /** Hazard types unlocked per stage. Stage 1 introduces only boxes; holes join
   *  at stage 2; boulders/lava/spikes at stage 3 (all but the portal); the wall
   *  block at stage 4. The teleport portal is gated separately (stage 4+). */
  const hazardPool = (stage: number): Array<{ kind: CellKind; obstacle?: ObstacleKind }> => {
    const pool: Array<{ kind: CellKind; obstacle?: ObstacleKind }> = [{ kind: 'obstacle', obstacle: 'box' }]
    if (stage >= 2) pool.push({ kind: 'hole' })
    if (stage >= 3) {
      pool.push({ kind: 'obstacle', obstacle: 'stone' })
      pool.push({ kind: 'lava' })
      pool.push({ kind: 'obstacle', obstacle: 'pyramid' })
    }
    if (stage >= 4) pool.push({ kind: 'obstacle', obstacle: 'wall' })
    return pool
  }

  /** Generate one row `r` of diamonds (valid `c` share parity with `r`). The
   *  "no two adjacent diamonds both hazardous" rule guarantees the ball always
   *  has at least one safe up-neighbour, so the run is always solvable. */
  const genRow = (r: number): void => {
    const safeRunway = r > -START_RUNWAY
    const stage = progress.stage.value
    const pHazard = stageHazardChance()
    const pool = hazardPool(stage)
    const portalsAllowed = stage >= 4
    const cols: number[] = []
    for (let c = 0; c <= C_MAX; c++) {
      if (((c + r) & 1) === 0) cols.push(c)
    }
    let prevHazard = false
    for (const c of cols) {
      let kind: CellKind = 'floor'
      let obstacle: ObstacleKind | undefined
      if (!safeRunway && !prevHazard && Math.random() < pHazard) {
        // Hazard drawn from the stage's unlocked pool.
        const pick = pool[Math.floor(Math.random() * pool.length)]!
        kind = pick.kind
        obstacle = pick.obstacle
        // Late game (stage 10+): half the spiky-poles become Liberty Cats.
        if (obstacle === 'pyramid' && stage >= 10 && Math.random() < 0.5) obstacle = 'libertyCat'
        prevHazard = true
      } else {
        prevHazard = false
        if (!safeRunway && portalsAllowed && Math.random() < 0.045) {
          kind = 'portal'
        } else if (!safeRunway && Math.random() < 0.2) {
          kind = 'coin'
        }
      }
      if (kind !== 'floor') {
        game.cells.set(cellKey(c, r), { c, r, kind, obstacle })
      }
    }

    // Item box: place it in the horizontal centre with a guaranteed-clear
    // approach so it's ALWAYS reachable by the diagonal-hop movement — never at
    // the edge, behind a wall, or across a hole the player can't cross.
    if (game.pendingItem && !safeRunway) {
      const mid = C_MAX >> 1
      // Keep parity valid for this row ((c + r) must be even); nudge off-centre by one if needed.
      const c = ((mid + r) & 1) === 0 ? mid : (Math.random() < 0.5 ? mid - 1 : mid + 1)
      game.cells.set(cellKey(c, r), { c, r, kind: 'item' })
      // Clear the two diamonds the ball can hop onto it from, so there's always a way in.
      game.cells.delete(cellKey(c - 1, r + 1))
      game.cells.delete(cellKey(c + 1, r + 1))
      game.pendingItem = false
      game.itemSpawned += 1
    }
  }

  const ensureGenerated = (): void => {
    const frontier = Math.floor(game.ballR) - GEN_AHEAD
    while (game.genR > frontier) {
      game.genR -= 1
      genRow(game.genR)
    }
  }

  const cull = (): void => {
    const behind = Math.ceil(game.ballR) + CULL_BEHIND
    for (const [k, cell] of game.cells) {
      if (cell.r > behind) game.cells.delete(k)
    }
    game.fx = game.fx.filter((f) => game.clock - f.bornAt < 900)
  }

  // ─── Movement helpers ───────────────────────────────────────────────────

  const isDeadlyKind = (cell: Cell | undefined): boolean => {
    if (!cell) return false
    if (cell.kind === 'hole') return true
    if (cell.kind === 'lava') return true
    if (cell.kind === 'obstacle') return true
    return false
  }

  /** Resolve the next target diamond from the current cell, honouring the
   *  queued heading, edge bounce, and the Dodge-Master auto-avoid. */
  const retarget = (): void => {
    game.dir = game.nextDir
    let tc = game.cell.c + game.dir
    if (tc < 0 || tc > C_MAX) {
      game.dir = (-game.dir) as 1 | -1
      game.nextDir = game.dir
      tc = game.cell.c + game.dir
    }
    const tr = game.cell.r - 1

    // Auto-dodge: if the chosen diamond is deadly, swing to the other neighbour
    // when it's safe (and in-bounds). Two sources can power a dodge —
    //   • the timed Dodge-Master power-up (free, always dodges while active), and
    //   • the permanent Dodge Apprentice upgrade (cooldown-gated; consumes a
    //     charge per dodge, recharging faster at higher levels).
    const apprenticeLevel = progress.levelOf('dodgeApprentice')
    const apprenticeReady = apprenticeLevel > 0 && game.clock >= game.dodgeReadyAt
    if (powerups.isActive('dodge') || apprenticeReady) {
      const chosen = game.cells.get(cellKey(tc, tr))
      if (isDeadlyKind(chosen)) {
        const altC = game.cell.c - game.dir
        if (altC >= 0 && altC <= C_MAX && !isDeadlyKind(game.cells.get(cellKey(altC, tr)))) {
          game.dir = (-game.dir) as 1 | -1
          game.nextDir = game.dir
          tc = altC
          // Only the apprentice pays a cooldown — the power-up dodge is free.
          if (!powerups.isActive('dodge')) {
            game.dodgeReadyAt = game.clock + dodgeCooldownMs(apprenticeLevel)
          }
          emitFx('sparkle', altC, tr, '#37e0a0')
          playSound('dodge', 0.05)
        }
      }
    }
    game.target = { c: tc, r: tr }
  }

  /** Teleport the ball to a random valid diamond several rows ahead, clearing
   *  the landing zone so it's a fair touchdown. The step loop re-targets from
   *  the new cell after this returns. */
  const teleportForward = (fromC: number, fromR: number): void => {
    emitFx('portal', fromC, fromR, '#9a6bff')
    const jump = 5 + Math.floor(Math.random() * 4) // 5..8 rows forward
    const destR = fromR - jump
    let destC = Math.floor(Math.random() * (C_MAX + 1))
    if (((destC + destR) & 1) !== 0) destC += destC < C_MAX ? 1 : -1 // keep parity valid
    destC = Math.max(0, Math.min(C_MAX, destC))
    ensureGenerated()
    // Clear the landing diamond and its up-neighbours so the player doesn't
    // teleport straight into a hazard.
    for (const [dc, dr] of [[0, 0], [-1, -1], [1, -1]] as const) {
      game.cells.delete(cellKey(destC + dc, destR + dr))
    }
    game.cell = { c: destC, r: destR }
    game.progress = 0
    // Slow time for a beat so the player can find where they landed.
    game.teleportSlowUntil = game.clock + TELEPORT_SLOW_MS
    emitFx('portal', destC, destR, '#9a6bff')
    playSound('gravity', 0.06)
  }

  const onEnterCell = (c: number, r: number): void => {
    score.value += 1
    // Queue an item box for the upcoming generation every 10 tiles travelled.
    if (score.value % 10 === 0) game.pendingItem = true
    const cell = game.cells.get(cellKey(c, r))

    // Win check.
    if (score.value >= stageTarget.value) {
      win()
      return
    }

    if (!cell || cell.kind === 'floor') return

    const invuln = powerups.isActive('invuln')

    if (cell.kind === 'portal') {
      teleportForward(c, r)
      return
    }
    if (cell.kind === 'coin') {
      collectCoin(cell)
      return
    }
    if (cell.kind === 'item') {
      grantItem(cell)
      return
    }
    if (cell.kind === 'hole') {
      if (invuln) { emitFx('sparkle', c, r, '#ffd23f'); return }
      startDrop()
      return
    }
    if (cell.kind === 'lava') {
      if (invuln) { emitFx('sparkle', c, r, '#ffd23f'); return }
      if (surviveWithSecondChance(c, r)) return
      game.exploded = true
      die('crash')
      return
    }
    if (cell.kind === 'obstacle') {
      if (invuln) {
        // Tear the obstacle apart (matches the ball's death-shatter language).
        emitFx('shatter', c, r, undefined, cell.obstacle)
        emitFx('pop', c, r, '#ffd23f')
        game.cells.delete(cellKey(c, r))
        awardInstantCoins(c, r, 3)
        playSound('shrapnel', 0.06)
        return
      }
      if (isPassableObstacle(cell.obstacle)) {
        emitFx('shatter', c, r, undefined, cell.obstacle)
        emitFx('push', c, r, '#ff7a3f')
        game.cells.delete(cellKey(c, r))
        awardInstantCoins(c, r, 3)
        playSound('shrapnel', 0.06)
        return
      }
      if (surviveWithSecondChance(c, r)) return
      game.exploded = true
      die('crash')
    }
  }

  /** Spend a held Second Chance to survive a lethal obstacle/lava hit: clear the
   *  hazard + its up-neighbours so the ball keeps rolling, and start the
   *  opacity-blink window. Returns false (doing nothing) when none is held. */
  const surviveWithSecondChance = (c: number, r: number): boolean => {
    if (!game.secondChance) return false
    game.secondChance = false
    // Clear the sticky pre-bought flag too: the shield is spent, so the player
    // must purchase another before it arms a future run.
    progress.consumeStartSecondChance()
    game.secondChanceBlinkUntil = game.clock + SECOND_CHANCE_BLINK_MS
    for (const [dc, dr] of [[0, 0], [-1, -1], [1, -1]] as const) {
      game.cells.delete(cellKey(c + dc, r + dr))
    }
    emitFx('sparkle', c, r, '#37e0a0')
    triggerShake('small')
    playSound('barricade', 0.06)
    return true
  }

  /** Spawn `n` coins at (c, r) that fly straight into the run tally, exactly
   *  like a grid-coin pickup. Used when a destructible obstacle is cleared. */
  const awardInstantCoins = (c: number, r: number, n: number): void => {
    coinsThisRun.value += n
    for (let i = 0; i < n; i++) emitFx('coin', c, r, '#ffd23f')
    playCoinSound()
  }

  const collectCoin = (cell: Cell): void => {
    if (cell.collected) return
    cell.collected = true
    const value = Math.round(upgradedValue('coinValue'))
    // Coins are tallied for the run but NOT banked to the wallet here — they're
    // granted on the win/lose screen with a CoinExplosion (see EpicancerScene).
    coinsThisRun.value += value
    emitFx('coin', cell.c, cell.r, '#ffd23f')
    game.cells.delete(cellKey(cell.c, cell.r))
    playCoinSound()
  }

  const grantItem = (cell: Cell): void => {
    game.cells.delete(cellKey(cell.c, cell.r))
    playSound('level-up', 0.07)
    triggerShake('small')
    // ~25% of item boxes grant the persistent Second Chance (when not already
    // held); otherwise a random timed power-up.
    if (!game.secondChance && Math.random() < 0.25) {
      game.secondChance = true
      emitFx('item', cell.c, cell.r, '#37e0a0')
      return
    }
    const type = powerups.randomType()
    powerups.activate(type, game.clock)
    emitFx('item', cell.c, cell.r, '#ffffff')
  }

  /** Coin Magnet: pull in nearby coins each frame. */
  const runMagnet = (): void => {
    if (!powerups.isActive('magnet')) return
    const range = upgradedValue('magnetRange') // pickup reach in tiles
    const r2 = range * range
    for (const cell of game.cells.values()) {
      if (cell.kind !== 'coin' || cell.collected) continue
      const dc = (cell.c - game.ballC) * 0.5
      const dr = cell.r - game.ballR
      if (dc * dc + dr * dr <= r2) collectCoin(cell)
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  const resetForStage = (): void => {
    game.cells.clear()
    game.fx = []
    const startC = 2 * Math.round(C_MAX / 4) // even, near centre
    game.cell = { c: startC, r: 0 }
    game.dir = 1
    game.nextDir = 1
    game.progress = 0
    game.ballC = startC
    game.ballR = 0
    game.speed = BASE_SPEED + (progress.stage.value - 1) * STAGE_SPEED_BONUS
    game.clock = 0
    game.runStartClock = 0
    game.genR = 1
    game.itemSpawned = 0
    game.pendingItem = false
    game.dropping = false
    game.dropClock = 0
    game.exploded = false
    game.teleportSlowUntil = 0
    // A pre-bought Second Chance arms the run: start with the shield (and its
    // angel wings) held. It persists across runs until one is actually spent.
    game.secondChance = progress.startSecondChance.value
    game.secondChanceBlinkUntil = 0
    game.dodgeReadyAt = 0 // every run starts with one Dodge Apprentice charge ready
    powerups.clear()
    score.value = 0
    coinsThisRun.value = 0
    lastWinReward.value = 0
    gameResult.value = ''
    lossCause.value = ''
    survivalMs.value = 0
    stageTarget.value = rubberBandedTarget(progress.stage.value)
    game.phase = 'idle'
    phase.value = 'idle'
    retarget()
    ensureGenerated()
  }

  const begin = (): void => {
    if (phase.value === 'playing') return
    game.phase = 'playing'
    phase.value = 'playing'
    game.runStartClock = game.clock
    progress.recordGamePlayed()
    awardAttempt() // every run grants the battle-pass participation XP
  }

  const flip = (): void => {
    if (phase.value !== 'playing') return
    game.nextDir = (-game.nextDir) as 1 | -1
    playSound('anchor-swap', 0.035, 1 + (Math.random() - 0.5) * 0.12)
  }

  /** Begin sinking the ball into the hole it just entered. Movement freezes;
   *  `step` advances `dropClock` and calls `die('hole')` once the sink finishes,
   *  so the player sees the ball fall into the void before the lose flow runs. */
  const startDrop = (): void => {
    if (game.dropping) return
    game.dropping = true
    game.dropClock = 0
    game.progress = 0
    // Falling into a hole — the gravity "drop" cue (same as the portal pull).
    playSound('gravity', 0.06)
  }

  const die = (cause: LossCause): void => {
    if (phase.value !== 'playing') return
    game.phase = 'dead'
    phase.value = 'dead'
    gameResult.value = 'lose'
    lossCause.value = cause
    // Rubber band: record this failed attempt so the next try at an early stage
    // gets a slightly lower tile goal (struggling-player assist; session-only).
    if (progress.stage.value <= RUBBER_BAND_STAGES) {
      const s = progress.stage.value
      stageFailCounts.set(s, (stageFailCounts.get(s) ?? 0) + 1)
    }
    survivalMs.value = game.clock - game.runStartClock
    // No collision FX: a hole death plays the ball's sink animation, a crash
    // plays the tear-apart (ball-shatter) animation — both stand on their own.
    triggerShake('big')
    // Hole death gets the soft "fell in" chime; an obstacle crash tears the
    // ball apart — fire a random plastic-torn variant so repeated deaths vary.
    if (cause === 'hole') playSound('celebration-1', 0.08)
    else playRandomVariant('plastic-torn', 2, 0.09)
    progress.recordScore(score.value)
  }

  /** Revive at the current spot: clear the hazard that killed the player and
   *  its immediate up-neighbours so they get a fair restart. */
  const revive = (): void => {
    const { c, r } = game.cell
    for (const [dc, dr] of [[0, 0], [-1, -1], [1, -1], [-2, 0], [2, 0]] as const) {
      game.cells.delete(cellKey(c + dc, r + dr))
    }
    game.progress = 0
    game.dropping = false
    game.dropClock = 0
    game.exploded = false
    game.teleportSlowUntil = 0
    game.secondChanceBlinkUntil = 0
    game.dodgeReadyAt = 0 // refresh the dodge charge on revive
    game.phase = 'playing'
    phase.value = 'playing'
    gameResult.value = ''
    lossCause.value = ''
    powerups.activate('invuln', game.clock) // brief mercy invulnerability
    retarget()
  }

  const win = (): void => {
    game.phase = 'won'
    phase.value = 'won'
    gameResult.value = 'win'
    survivalMs.value = game.clock - game.runStartClock
    const survivalSec = survivalMs.value / 1000
    const reward = Math.round(score.value * 0.5 + survivalSec * 2 + progress.stage.value * 10)
    lastWinReward.value = reward
    // Reward coins are banked on the win screen (with the CoinExplosion), not here.
    progress.recordScore(score.value)
    progress.advanceStage()
    playSound('celebration-2', 0.09)
    triggerShake('strong')
  }

  // ─── Per-frame step ───────────────────────────────────────────────────────

  /** Advance the simulation by `dtMs`. `dtMs` is already pause-gated by the
   *  scene's RAF loop. */
  const step = (dtMs: number): void => {
    const dt = Math.min(dtMs, 50) / 1000 // clamp to avoid tunnelling on stalls
    game.clock += dtMs

    if (phase.value !== 'playing') {
      // Still update the float render pos so the idle ball sits on its cell.
      game.ballC = game.cell.c
      game.ballR = game.cell.r
      return
    }

    // Sinking into a hole: hold the ball on the hole cell while it drops, then
    // register the death once the fall completes.
    if (game.dropping) {
      game.dropClock += dtMs
      game.ballC = game.cell.c
      game.ballR = game.cell.r
      if (game.dropClock >= DROP_MS) die('hole')
      return
    }

    powerups.update(game.clock)

    // Speed: a per-stage starting speed that accelerates as the player nears the
    // goal (fraction of the stage's tile target travelled). Stages 1-5 ramp a
    // gentle +30%; stage 6+ ramp +66%.
    const stage = progress.stage.value
    const startSpeed = BASE_SPEED + (stage - 1) * STAGE_SPEED_BONUS
    const frac = Math.min(1, Math.max(0, score.value / Math.max(1, stageTarget.value)))
    const rampMax = stage <= 5 ? EARLY_STAGE_RAMP : LATE_STAGE_RAMP
    let speed = Math.min(MAX_SPEED, startSpeed * (1 + rampMax * frac))
    // Difficulty: Easy −20% (more reaction time), Medium ×1, Hard +10%.
    speed *= difficultySpeedFactor()
    if (powerups.isActive('slowmo')) speed *= 0.5
    if (game.clock < game.teleportSlowUntil) speed *= TELEPORT_SLOW_FACTOR
    game.speed = speed
    survivalMs.value = game.clock - game.runStartClock

    game.progress += speed * dt

    // Pre-collision: if the next diamond holds a lethal obstacle (one not
    // bypassed by invuln or a push-able small obstacle), blow up at the midpoint
    // of the hop instead of sliding onto it.
    const tcell = game.cells.get(cellKey(game.target.c, game.target.r))
    const lethalObstacle = tcell?.kind === 'obstacle'
      && !powerups.isActive('invuln')
      && !isPassableObstacle(tcell.obstacle)
    if (lethalObstacle && game.progress >= 0.5) {
      // A held Second Chance clears the obstacle and lets the ball roll on;
      // otherwise it blows up at the midpoint of the hop.
      if (!surviveWithSecondChance(game.target.c, game.target.r)) {
        game.progress = 0.5
        game.ballC = game.cell.c + (game.target.c - game.cell.c) * 0.5
        game.ballR = game.cell.r + (game.target.r - game.cell.r) * 0.5
        game.exploded = true
        die('crash')
        return
      }
    }

    // Commit as many diamonds as we crossed this frame.
    let guard = 0
    while (game.progress >= 1 && phase.value === 'playing' && guard++ < 16) {
      game.progress -= 1
      game.cell = { ...game.target }
      onEnterCell(game.cell.c, game.cell.r)
      if (phase.value !== 'playing' || game.dropping) break
      retarget()
      ensureGenerated()
    }

    // The ball just dropped into a hole this frame: lock it there and let the
    // drop animation take over next frame.
    if (game.dropping) {
      game.ballC = game.cell.c
      game.ballR = game.cell.r
      return
    }

    // Smoothed render position.
    game.ballC = game.cell.c + (game.target.c - game.cell.c) * game.progress
    game.ballR = game.cell.r + (game.target.r - game.cell.r) * game.progress

    runMagnet()
    cull()
  }

  return {
    // reactive
    phase,
    score,
    gameResult,
    lossCause,
    coinsThisRun,
    lastWinReward,
    stageTarget,
    survivalMs,
    activePowerup: powerups.active,
    // control
    resetForStage,
    begin,
    flip,
    step,
    die,
    revive,
    // helpers for the scene
    powerupRemainingMs: (): number => powerups.remainingMs(game.clock),
    isPowerupActive: (t: PowerupType): boolean => powerups.isActive(t),
    clock: (): number => game.clock
  }
}

export default useEpicGame
