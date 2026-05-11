import { ref, computed, watch, type Ref } from 'vue'
import useMawCampaign, { type MawStage, type MawIsland, type Obstacle, motionPositionAt } from '@/use/useMawCampaign'
import { pointInIsland } from '@/use/useIslandShapes'
import useMawProgress, { upgradedValue, levelOf, markBrokenFromObstacle } from '@/use/useMawProgress'
import {
  ghostRunStartRecording,
  ghostRunRecordSwap,
  ghostRunCommitWin,
  ghostRunReset,
  liveRunStartMs
} from '@/use/useMawGhost'
import useSounds from '@/use/useSound'
import useMawConfig from '@/use/useMawConfig'
import { useScreenshake } from '@/use/useScreenshake'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import { testStage } from '@/use/useCustomStages'
import useBattlePass from '@/use/useBattlePass'

/**
 * Core game-loop composable for Maw-It-Down.
 *
 * The robot is two gears connected by a chain. One gear is the **anchor**
 * (rooted to the ground, axis of rotation) and the other is the **swing**
 * gear (orbits the anchor at a fixed radius = chain length). A pointer
 * tap swaps which gear is the anchor — the swing gear's current world
 * position becomes the new anchor, and the previous anchor becomes the
 * new swinger orbiting at the chain length.
 *
 * Hit-tests:
 *   - chain segment vs grass blade: clear & drop a coin
 *   - chain segment vs tree stump:  damage robot (1) UNLESS player has
 *     `sawDamage` upgrade ≥ 1, in which case the stump is also destroyed
 *   - chain segment vs boulder:     damage robot (2)
 *   - new anchor over water:        instant-death
 *
 * Camera follows the anchor gear so the world scrolls smoothly past.
 */

export type Phase =
  | 'idle'
  | 'ad_break'
  | 'meteor_intro'
  | 'playing'
  | 'game_over'

export type GameResult = '' | 'win' | 'lose'

export interface Vec2 { x: number; y: number }

export interface Coin {
  /** World position. */
  x: number
  y: number
  /** Flight progress 0..1; 1 = collected. */
  t: number
  /** ms timestamp the coin spawned. */
  spawnedAt: number
  /** Targets the player gear when the magnet fires. */
  origin: { x: number; y: number }
  /** Coin denomination on collection. Defaults to `COIN_PER_GRASS` (1) for
   *  grass cuts; obstacle bursts use this to keep the visual count low
   *  while still paying out the full reward (5 coins × 4 = 20 etc.). */
  value?: number
}

const COIN_PER_GRASS = 1
/** Probability a cut grass blade actually drops a coin. Cleared count and
 *  achievement metrics tick on every cut regardless — only the coin spawn
 *  rolls the dice. Tuned so that mowing feels rewarded but not floody. */
const COIN_DROP_CHANCE = 0.33

const useMawGame = () => {
  const { currentStage, currentStageId, advanceStage, stageReinitSignal } = useMawCampaign()
  const { addCoins } = useMawConfig()
  const { recordMetric } = useMawProgress()
  const { playSound, playRandomVariant } = useSounds()
  // Grass-cut audio throttle. Hundreds of blades can fall in a single
  // chain sweep, and without rate-limiting the SFX layer melts into a
  // wash of clicks. Two gates work together:
  //   • a 30 ms minimum interval between consecutive cut-sound starts —
  //     so even the densest mow can't trigger more than ~33 voices/s
  //   • a 4-voice ceiling on simultaneous playback, tracked via the
  //     `ended` event on each returned SoundHandle
  // A new voice is only spawned when BOTH gates are open.
  const GRASS_CUT_MIN_INTERVAL_MS = 30
  const GRASS_CUT_MAX_VOICES = 4
  let lastGrassCutAt = 0
  let activeGrassCutVoices = 0
  const tryPlayGrassCut = () => {
    const now = performance.now()
    if (now - lastGrassCutAt < GRASS_CUT_MIN_INTERVAL_MS) return
    if (activeGrassCutVoices >= GRASS_CUT_MAX_VOICES) return
    const handle = playRandomVariant('grass-cut', 3, 0.05, 0.08)
    if (!handle) return
    lastGrassCutAt = now
    activeGrassCutVoices += 1
    handle.addEventListener('ended', () => {
      activeGrassCutVoices = Math.max(0, activeGrassCutVoices - 1)
    })
  }
  const { triggerShake } = useScreenshake()
  const { awardAttempt, awardCampaignWin } = useBattlePass()

  const phase: Ref<Phase> = ref('idle')
  const gameResult: Ref<GameResult> = ref('')

  // Chain length (gear-to-gear distance) is upgrade-driven.
  const chainLength = computed(() => upgradedValue('chainLength'))
  // Player has 2 base life + Reinforced Frame upgrade.
  const maxLife = computed(() => upgradedValue('maxLife'))
  const life: Ref<number> = ref(maxLife.value)
  // Buying Reinforced Frame mid-round drops a fresh lit wrench onto the
  // life badge for the current round — the new slot's pip starts filled
  // rather than the player having to die down to it. A decrease (e.g.
  // future cloud-pulled state with a lower max) caps current life to the
  // new ceiling.
  watch(maxLife, (next, prev) => {
    if (next > prev) life.value = Math.min(next, life.value + (next - prev))
    else if (next < prev) life.value = Math.min(life.value, next)
  })
  const sawTier = computed(() => levelOf('sawDamage'))
  const coinMagnetMs = computed(() => Math.max(150, upgradedValue('coinMagnetMs')))
  const rotationSpeedMul = computed(() => upgradedValue('rotationSpeed'))

  /** Hard pause for forced UI moments (e.g. the Sharper-Saw spotlight
   *  modal). When true, the tick early-exits — chain stops spinning,
   *  obstacles stay still, and the scene effectively freezes until the
   *  caller flips it back. Different from `phase === 'idle'` because
   *  this pause can resume mid-round with full state preserved. */
  const isPaused: Ref<boolean> = ref(false)

  // Robot state — both gears live in world coordinates.
  const anchorPos = ref<Vec2>({ x: 0, y: 0 })
  const swingPos = ref<Vec2>({ x: chainLength.value, y: 0 })
  const swingAngle: Ref<number> = ref(0) // radians, swing relative to anchor
  /** Which gear is currently the anchor (true) vs swinger. */
  const anchorIsLeft: Ref<boolean> = ref(true)
  /** Direction of rotation; flipped each anchor swap so the new swing arc
   *  continues away from the previous arc. */
  const rotationSign: Ref<1 | -1> = ref(1)

  const cleared: Ref<number> = ref(0)
  const coins: Ref<Coin[]> = ref([])
  /** Visual-only: flips true the first time the chain touches the exit pole.
   *  The pole still works as an exit either way. */
  const poleCut: Ref<boolean> = ref(false)
  const reqsMet = computed(() => cleared.value >= stage.value.targetClears)

  const stage: Ref<MawStage> = ref(currentStage.value)
  // Per-island grass + obstacles cloned so they can be mutated in-place.
  interface RuntimeIsland extends MawIsland {
    aliveGrass: Set<number>
    obstacles: Obstacle[]
  }
  const islands: Ref<RuntimeIsland[]> = ref([])

  const initIslands = () => {
    const nowMs = performance.now()
    islands.value = stage.value.islands.map(src => {
      // Deep-clone grass and obstacles — moving islands mutate these
      // each tick to follow the platform, so they must not share refs
      // with the immutable stage data.
      const isle: RuntimeIsland = {
        ...src,
        cx: src.cx,
        cy: src.cy,
        grass: src.grass.map(g => [g[0], g[1]] as [number, number]),
        obstacles: src.obstacles.map(o => ({ ...o })),
        decor: src.decor ? src.decor.map(d => ({ ...d })) : undefined,
        aliveGrass: new Set(src.grass.map((_, idx) => idx))
      }
      // For moving islands, snap to the motion's position at boot (with
      // phase) and translate grass + obstacles + decor by the same
      // offset so everything starts visually aligned with the platform.
      if (src.motion) {
        const p = motionPositionAt(src.motion, nowMs)
        const dx = p.x - src.cx
        const dy = p.y - src.cy
        if (dx !== 0 || dy !== 0) {
          isle.cx = p.x
          isle.cy = p.y
          for (const blade of isle.grass) {
            blade[0] += dx
            blade[1] += dy
          }
          for (const ob of isle.obstacles) {
            ob.x += dx
            ob.y += dy
          }
          if (isle.decor) {
            for (const d of isle.decor) {
              d.x += dx
              d.y += dy
            }
          }
        }
      }
      return isle
    })
  }

  // ─── Public lifecycle ────────────────────────────────────────────────────

  const initGame = () => {
    stage.value = currentStage.value
    initIslands()
    cleared.value = 0
    coins.value = []
    poleCut.value = false
    life.value = maxLife.value
    phase.value = 'idle'
    // NOTE: gameResult is intentionally NOT reset here. `onWin` calls
    // `advanceStage()` → `stageReinitSignal++` → this `initGame()` runs
    // in the SAME Vue flush as the `phase` watch in MawScene. If we
    // reset `gameResult` here, the reward modal renders AFTER both
    // watches and reads `gameResult === ''` instead of `'win'`, falling
    // through to the loss text. The next `onWin` / `onLose` overwrites
    // `gameResult` anyway, so leaving the stale value is safe — and the
    // modal is closed during the in-between idle state.

    // Place robot at home-island center.
    anchorPos.value = { x: 0, y: 0 }
    swingPos.value = { x: chainLength.value, y: 0 }
    swingAngle.value = 0
    anchorIsLeft.value = true
    rotationSign.value = 1
    // Snap camera so a fresh stage doesn't ease in from a stale position.
    cameraPos.value = { x: 0, y: 0 }
  }

  const startMatch = () => {
    phase.value = 'playing'
    // Battle-pass: every play attempt grants a flat XP tick the moment the
    // chain actually starts spinning. Editor test stages are excluded
    // because they aren't part of the season's progression.
    if (!testStage.value) awardAttempt()
    // Begin ghost-trail recording — stamps t=0 + the spawn anchor. The
    // first swap stamps its delta against this start time. Editor test
    // runs are excluded because they aren't part of the campaign and
    // would otherwise overwrite a real stage's recording.
    if (!testStage.value) {
      ghostRunStartRecording(currentStageId.value, anchorPos.value.x, anchorPos.value.y)
    } else {
      ghostRunReset()
    }
  }

  // ─── Geometry helpers ────────────────────────────────────────────────────

  const isOverIsland = (x: number, y: number): boolean => {
    // Pixel-perfect: once each island bitmap has decoded, `pointInIsland`
    // samples the actual walkable mask traced from the green grass cap,
    // so the chain-anchor hit-test matches exactly what the player sees.
    // Until then, the call falls back to the shape's hand-traced polygon.
    for (const isle of islands.value) {
      if (pointInIsland(isle.shape, x, y, isle.cx, isle.cy, isle.radius)) return true
    }
    return false
  }

  const distToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return Math.hypot(px - ax, py - ay)
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx
    const cy = ay + t * dy
    return Math.hypot(px - cx, py - cy)
  }

  /** Gear visual radius (round body + teeth tips). Anything whose centre
   *  touches a tooth is "visually on the gear" and should also count as
   *  a hit on the chain. */
  const GEAR_HIT_RADIUS = 32

  /** Distance from (px, py) to the chain's *visual* hit shape. Same as
   *  `distToSegment` along the body of the chain, but at each gear end
   *  the gear's visible radius (teeth tips) is subtracted — so things
   *  that visibly touch a gear are effectively touching the chain.
   *  Caller still tests against the per-obstacle cut radius. */
  const distToChain = (
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number
  ): number => {
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) {
      return Math.max(0, Math.hypot(px - ax, py - ay) - GEAR_HIT_RADIUS)
    }
    const t = ((px - ax) * dx + (py - ay) * dy) / lenSq
    if (t <= 0) {
      // Behind the anchor gear — the gear body covers a halo of
      // GEAR_HIT_RADIUS around the centre, so subtract it.
      return Math.max(0, Math.hypot(px - ax, py - ay) - GEAR_HIT_RADIUS)
    }
    if (t >= 1) {
      // Past the swing gear — same halo on the other end.
      return Math.max(0, Math.hypot(px - bx, py - by) - GEAR_HIT_RADIUS)
    }
    // Alongside the chain body — perpendicular distance to the segment.
    const cx = ax + t * dx
    const cy = ay + t * dy
    return Math.hypot(px - cx, py - cy)
  }

  // ─── Tick ────────────────────────────────────────────────────────────────

  const tick = (dt: number) => {
    if (phase.value !== 'playing') return
    if (isPaused.value) return

    // Step any moving islands FIRST so the chain's grass/obstacle hits
    // below test against their up-to-date position, and `isOverIsland`
    // (called from `swapAnchor`) sees the live polygon. Translating the
    // grass + obstacles by the same delta keeps the platform's decor
    // glued to the moving island; if the player's anchor gear is
    // currently planted on this island, it also rides along (otherwise
    // they'd appear to float in mid-air as the platform slides out).
    const nowMs = performance.now()
    for (const isle of islands.value) {
      const m = isle.motion
      if (!m) continue
      // Check anchor ownership BEFORE applying the delta so the test
      // uses the island's pre-move polygon.
      const anchorOnThis = pointInIsland(
        isle.shape,
        anchorPos.value.x, anchorPos.value.y,
        isle.cx, isle.cy, isle.radius
      )
      const p = motionPositionAt(m, nowMs)
      const dx = p.x - isle.cx
      const dy = p.y - isle.cy
      if (dx === 0 && dy === 0) continue
      isle.cx = p.x
      isle.cy = p.y
      for (const blade of isle.grass) {
        blade[0] += dx
        blade[1] += dy
      }
      for (const ob of isle.obstacles) {
        ob.x += dx
        ob.y += dy
      }
      if (isle.decor) {
        for (const d of isle.decor) {
          d.x += dx
          d.y += dy
        }
      }
      if (anchorOnThis) {
        anchorPos.value = {
          x: anchorPos.value.x + dx,
          y: anchorPos.value.y + dy
        }
      }
    }

    // Advance swing rotation
    const baseSpeed = 2.1 // rad/sec at upgrade level 0
    const speed = baseSpeed * rotationSpeedMul.value * rotationSign.value
    swingAngle.value += speed * dt
    swingPos.value = {
      x: anchorPos.value.x + Math.cos(swingAngle.value) * chainLength.value,
      y: anchorPos.value.y + Math.sin(swingAngle.value) * chainLength.value
    }

    // Chain hit-testing — the chain is the segment between anchor and swing.
    const ax = anchorPos.value.x
    const ay = anchorPos.value.y
    const bx = swingPos.value.x
    const by = swingPos.value.y

    for (const isle of islands.value) {
      // Grass cuts
      for (const idx of [...isle.aliveGrass]) {
        const [gx, gy] = isle.grass[idx]!
        if (distToChain(gx, gy, ax, ay, bx, by) < 14) {
          isle.aliveGrass.delete(idx)
          cleared.value += 1
          recordMetric('totalGrass', 1)
          // Random `grass-cut-{1,2,3}` with ±8 % pitch jitter so a wide
          // sweep doesn't sound like one note retriggering. The throttle
          // (30 ms min interval, 4 simultaneous voice ceiling) lives
          // inside `tryPlayGrassCut`.
          tryPlayGrassCut()
          if (Math.random() < COIN_DROP_CHANCE) {
            coins.value.push({
              x: gx, y: gy, t: 0,
              origin: { x: gx, y: gy },
              spawnedAt: performance.now()
            })
          }
        }
      }

      // Obstacle hits — single-shot per chain pass: each obstacle has a
      // cooldown so the player doesn't take damage per-frame while the
      // chain glides over it.
      for (let i = isle.obstacles.length - 1; i >= 0; i--) {
        const ob = isle.obstacles[i]!
        const obAny = ob as Obstacle & { _cooldown?: number }
        if ((obAny._cooldown ?? 0) > 0) {
          obAny._cooldown! -= dt
          continue
        }
        const radius =
          ob.type === 'boulder' ? 26
          : ob.type === 'crystal' ? 18
          : ob.type === 'liberty' ? 28
          : 22 // stump
        if (distToChain(ob.x, ob.y, ax, ay, bx, by) < radius) {
          // Saw-tier gating mirrors the upgrade description:
          //   • trees    cuttable from saw Lv. 1
          //   • stones   cuttable from saw Lv. 3
          //   • crystals cuttable from saw Lv. 6
          //   • liberty  cuttable from saw Lv. 8
          // Below the threshold the obstacle hurts the chain instead.
          // Cut-obstacle coin payouts: stumps 10, stones 20, crystals 30, liberty 50.
          // Spawn 5 coin sprites and tag each with the per-coin value so the
          // visual burst stays readable instead of 30 individual coins
          // streaming to the gear at once.
          const spawnCoinBurst = (cx: number, cy: number, total: number) => {
            const now = performance.now()
            const N = 5
            const value = Math.max(1, Math.round(total / N))
            for (let k = 0; k < N; k++) {
              const a = (k / N) * Math.PI * 2
              const px = cx + Math.cos(a) * 9
              const py = cy + Math.sin(a) * 9
              coins.value.push({
                x: px, y: py, t: 0,
                origin: { x: px, y: py },
                spawnedAt: now,
                value
              })
            }
          }
          if (ob.type === 'liberty') {
            if (sawTier.value >= 8) {
              isle.obstacles.splice(i, 1)
              cleared.value += 1
              recordMetric('libertiesDestroyed', 1)
              triggerShake('strong')
              spawnCoinBurst(ob.x, ob.y, 50)
              continue
            }
            // The cat is heavy — un-cut contact ticks 2 damage like a
            // boulder, but with a bigger shake so the player reads it
            // as the heaviest obstacle in the game.
            applyDamage(2)
            triggerShake('strong')
          } else if (ob.type === 'crystal') {
            if (sawTier.value >= 6) {
              isle.obstacles.splice(i, 1)
              cleared.value += 1
              recordMetric('crystalsDestroyed', 1)
              playSound('crystal-cut', 0.08)
              triggerShake('small')
              spawnCoinBurst(ob.x, ob.y, 30)
              continue
            }
            applyDamage(1)
            triggerShake('small')
          } else if (ob.type === 'stump') {
            if (sawTier.value >= 1) {
              isle.obstacles.splice(i, 1)
              recordMetric('stumpsDestroyed', 1)
              playSound('wood-cut', 0.08)
              triggerShake('small')
              spawnCoinBurst(ob.x, ob.y, 10)
              continue
            }
            applyDamage(1)
            triggerShake('small')
          } else {
            // boulder
            if (sawTier.value >= 3) {
              isle.obstacles.splice(i, 1)
              recordMetric('bouldersDestroyed', 1)
              playSound('stone-cut', 0.08)
              triggerShake('small')
              spawnCoinBurst(ob.x, ob.y, 20)
              continue
            }
            applyDamage(2)
            triggerShake('strong')
          }
          obAny._cooldown = 0.7
        }
      }
    }

    // Coin magnet: after `coinMagnetMs` post-spawn, pull coins toward the
    // anchored gear and award them on arrival.
    const now = performance.now()
    const magnet = coinMagnetMs.value
    for (let i = coins.value.length - 1; i >= 0; i--) {
      const c = coins.value[i]!
      const age = now - c.spawnedAt
      if (age >= magnet) {
        const flightT = Math.min(1, (age - magnet) / 320)
        c.t = flightT
        c.x = c.origin.x + (anchorPos.value.x - c.origin.x) * easeIn(flightT)
        c.y = c.origin.y + (anchorPos.value.y - c.origin.y) * easeIn(flightT)
        if (flightT >= 1) {
          const award = c.value ?? COIN_PER_GRASS
          coins.value.splice(i, 1)
          addCoins(award)
          recordMetric('totalCoins', award)
          // Throttled coin ding — a mowing burst can land 10+ coins on
          // the gear in a single frame, so only one ding plays per
          // 200 ms window to keep the pickup readable.
          const now2 = performance.now()
          if (now2 - lastCoinPickupSoundAt >= COIN_PICKUP_MIN_INTERVAL_MS) {
            playSound('coin-pickup', 0.06)
            lastCoinPickupSoundAt = now2
          }
        }
      }
    }

    // Exit-pole hit-test. Touching the pole always marks it cut (visual);
    // when the player has already met the clear requirement, contact wins
    // the stage. The pole keeps working as an exit even after being cut.
    const ex = stage.value.exitX
    const ey = stage.value.exitY
    if (distToChain(ex, ey, ax, ay, bx, by) < 18) {
      if (!poleCut.value) poleCut.value = true
      if (reqsMet.value && phase.value === 'playing') {
        onWin()
      }
    }
  }

  const easeIn = (t: number): number => t * t

  const applyDamage = (n: number) => {
    life.value = Math.max(0, life.value - n)
    // Metallic clank whenever the chain takes damage without cutting
    // (stumps below saw Lv 1, boulders below Lv 3, crystals below Lv 6,
    // liberty cats below Lv 8). Skipped on the lethal hit so the
    // `break-down-death` sound played by the loss watcher in MawScene
    // doesn't overlap with this clank — that final tick needs its own
    // beat to read as "you died" rather than "another bonk".
    if (life.value > 0) playSound('obstacle-hit', 0.07)
    if (life.value === 0) {
      onLose('broke')
    }
  }

  // ─── Anchor swap ─────────────────────────────────────────────────────────

  /** Last anchor that was confirmed on solid ground. Captured at the
   *  moment the player splashes so the coin-revive path has somewhere
   *  to put the robot back. Initialised to the spawn point so a
   *  pre-first-swap splash (shouldn't be possible, but…) still resolves. */
  const lastSafeAnchor: Ref<Vec2> = ref({ x: 0, y: 0 })

  // Throttle the kachunk SFX so a rage-clicking player doesn't get a
  // machine-gun stream — at 50 ms it caps at ~20 voices/s which is well
  // below the engine's swap rate (most players swap 1-4× per second).
  const ANCHOR_SWAP_MIN_INTERVAL_MS = 50
  let lastAnchorSwapSoundAt = 0

  // Coin-pickup ding throttle — magnetised coins arrive at the gear in
  // tight bursts (one full mowing pass can drop 10+ coins inside a
  // single frame). 200 ms between dings is short enough to feel
  // responsive but long enough that a wide burst doesn't sound like
  // one continuous trill.
  const COIN_PICKUP_MIN_INTERVAL_MS = 200
  let lastCoinPickupSoundAt = 0

  const swapAnchor = () => {
    if (phase.value !== 'playing') return
    const prevAnchor = { ...anchorPos.value }
    const newAnchor = { ...swingPos.value }

    // Water death — landing the new anchor over open water kills instantly.
    if (!isOverIsland(newAnchor.x, newAnchor.y)) {
      // Remember the pre-splash safe anchor so a coin-revive can put
      // the robot back on the island the player was standing on.
      lastSafeAnchor.value = prevAnchor
      anchorPos.value = newAnchor
      onLose('splashed')
      triggerShake('big')
      return
    }

    anchorPos.value = newAnchor
    // Mechanical kachunk on every successful swap, throttled so a
    // rage-clicking player can't trigger a cascade.
    const now = performance.now()
    if (now - lastAnchorSwapSoundAt >= ANCHOR_SWAP_MIN_INTERVAL_MS) {
      playSound('anchor-swap', 0.06)
      lastAnchorSwapSoundAt = now
    }
    // Ghost-trail: stamp the swap so the next attempt can replay the
    // path. Done only for real campaign runs (test stages bypass the
    // recording entirely; see startMatch).
    if (!testStage.value) ghostRunRecordSwap(newAnchor.x, newAnchor.y)
    // The previous anchor becomes the new swing gear; its current
    // angle relative to the new anchor is the starting `swingAngle`.
    const dx = prevAnchor.x - newAnchor.x
    const dy = prevAnchor.y - newAnchor.y
    swingAngle.value = Math.atan2(dy, dx)
    swingPos.value = prevAnchor
    anchorIsLeft.value = !anchorIsLeft.value
    rotationSign.value = (rotationSign.value === 1 ? -1 : 1)
  }

  // ─── Win / lose ──────────────────────────────────────────────────────────

  /** Last-cleared stage time in ms and whether it was a new record. Set
   *  by `onWin` so the FReward win modal can render "Best: 12.4s" / 🎉. */
  const lastClearedTimeMs: Ref<number | null> = ref(null)
  const lastClearedWasBest: Ref<boolean> = ref(false)
  const lastClearedPrevBestMs: Ref<number | null> = ref(null)

  const onWin = () => {
    phase.value = 'game_over'
    gameResult.value = 'win'
    // Triumphant stinger the instant the chain touches the pole. Fires
    // BEFORE the MOW-A-HERO completion path in MawScene's phase watch
    // takes over with its louder reward-jingle on the final stage, so
    // the cue still lands cleanly on stages 1-19.
    playSound('win', 0.18)
    addCoins(stage.value.rewardWin)
    recordMetric('totalCoins', stage.value.rewardWin)
    recordMetric('gamesPlayed', 1)
    recordMetric('gamesWon', 1)
    // Commit the ghost recording + speedrun time BEFORE advanceStage so
    // the record is bound to the stage that was just cleared, not the
    // one the player is about to roll into.
    if (!testStage.value) {
      const startMs = liveRunStartMs.value
      const elapsed = startMs > 0 ? performance.now() - startMs : 0
      const stamp = ghostRunCommitWin(currentStageId.value, elapsed)
      lastClearedTimeMs.value = stamp?.time ?? Math.round(elapsed)
      lastClearedWasBest.value = stamp?.isNewBest ?? false
      lastClearedPrevBestMs.value = stamp?.prevBest ?? null
      recordMetric('maxStage', currentStageId.value + 1)
      // ─── Speedrun-related metrics ──────────────────────────────────
      // New-record beats drive the Speed Demon / Time Trial Pro chains.
      if (stamp?.isNewBest && stamp.prevBest !== null) {
        // Only count subsequent record-beats — the very first clear of
        // a stage isn't "beating" anything, just establishing the bar.
        recordMetric('newRecordsSet', 1)
      }
      const clearedSec = (stamp?.time ?? elapsed) / 1000
      if (clearedSec > 0 && clearedSec < 10) {
        recordMetric('subTenSecondWins', 1)
      }
      // bestSecondsFloor uses an inverted scale so "higher number = better
      // time"; see useMawProgress.ts for the rationale. Floored to int.
      if (clearedSec > 0 && clearedSec < 60) {
        recordMetric('bestSecondsFloor', Math.floor(60 - clearedSec))
      }
      advanceStage()
      awardCampaignWin()
    } else {
      lastClearedTimeMs.value = null
      lastClearedWasBest.value = false
      lastClearedPrevBestMs.value = null
    }
  }

  const lossReason: Ref<'splashed' | 'broke' | ''> = ref('')

  const onLose = (reason: 'splashed' | 'broke') => {
    if (phase.value === 'game_over') return
    phase.value = 'game_over'
    gameResult.value = 'lose'
    lossReason.value = reason
    // Drop the partial ghost buffer — dead-end paths shouldn't pollute
    // the next attempt's replay.
    ghostRunReset()
    recordMetric('gamesPlayed', 1)
    addCoins(stage.value.rewardLose)
    recordMetric('totalCoins', stage.value.rewardLose)
    // First time the player gets ground down by an obstacle, flip the
    // persistent flag so MawScene can show the "buy Sharper Saw Lv 2"
    // onboarding hint until they actually buy it.
    if (reason === 'broke') markBrokenFromObstacle()
  }

  /**
   * Resurrect the player from either kind of death.
   *
   *   • `'broke'` — life ran out from obstacle hits. Refills life to max
   *     and bumps every obstacle's cooldown so the chain isn't
   *     insta-killed by the same stump it just died on.
   *   • `'splashed'` — the anchor landed over open water. The pre-splash
   *     safe anchor (captured in `swapAnchor`) is restored and the
   *     swing gear is re-seated at the chain length so the player has
   *     somewhere to stand again.
   *
   * Returns `true` when the resurrection happened, `false` if the
   * current state isn't eligible (so the caller can decide what to do —
   * e.g. fall through to the regular loss-reward modal).
   */
  const continueAfterDeath = (): boolean => {
    if (phase.value !== 'game_over') return false
    if (gameResult.value !== 'lose') return false
    if (lossReason.value === 'broke') {
      life.value = maxLife.value
      for (const isle of islands.value) {
        for (const ob of isle.obstacles) {
          const obAny = ob as Obstacle & { _cooldown?: number }
          obAny._cooldown = 1.5
        }
      }
    } else if (lossReason.value === 'splashed') {
      // Teleport the anchor back to the last island the player was on,
      // top up life (a splash is brutal — leave them with full HP so the
      // 1000-coin / ad investment doesn't feel wasted) and re-seat the
      // swing gear at the chain length so the orbit picks back up.
      anchorPos.value = { ...lastSafeAnchor.value }
      life.value = maxLife.value
      swingAngle.value = 0
      swingPos.value = {
        x: anchorPos.value.x + chainLength.value,
        y: anchorPos.value.y
      }
    } else {
      return false
    }
    gameResult.value = ''
    lossReason.value = ''
    phase.value = 'playing'
    return true
  }

  // ─── Camera ──────────────────────────────────────────────────────────────

  // Stateful camera that eases toward the anchor instead of snapping. Anchor
  // swaps teleport the player by a full chain-length each click, so without
  // smoothing the world reads as a hard cut.
  const cameraPos = ref<Vec2>({ x: 0, y: 0 })

  /** Frame-rate-independent exponential smoothing. tau ≈ 0.18s lands the
   *  camera within ~5% of the target in roughly half a second — fast enough
   *  to feel responsive, soft enough to read as motion. */
  const updateCamera = (dt: number) => {
    const tau = 0.18
    const alpha = 1 - Math.exp(-Math.max(0, dt) / tau)
    cameraPos.value = {
      x: cameraPos.value.x + (anchorPos.value.x - cameraPos.value.x) * alpha,
      y: cameraPos.value.y + (anchorPos.value.y - cameraPos.value.y) * alpha
    }
  }

  return {
    // State
    phase,
    gameResult,
    lossReason,
    life,
    maxLife,
    cleared,
    coins,
    coinMagnetMs,
    sawTier,
    chainLength,
    poleCut,
    reqsMet,
    isPaused,
    lastClearedTimeMs,
    lastClearedWasBest,
    lastClearedPrevBestMs,

    // Robot
    anchorPos,
    swingPos,
    swingAngle,
    anchorIsLeft,
    cameraPos,

    // World
    stage,
    islands,

    // Lifecycle
    initGame,
    startMatch,
    tick,
    swapAnchor,
    updateCamera,
    continueAfterDeath,

    // Convenience
    stageReinitSignal,
    isOverIsland
  }
}

export default useMawGame
