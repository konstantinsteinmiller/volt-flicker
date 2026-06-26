import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// ─── Cloud → composable hydrate (CrazyGames cloud-only mode) ────────────────
//
// Proves the load-side wiring: the whole game state lives in the single
// `construct_state` blob (an allowlisted payload key), so the
// CrazyGamesStrategy mirrors it verbatim to `sdk.data`. On boot,
// `reloadEpicState()` is wired into the `saveDataVersion` bump inside
// useSaveStatus, so every `watch(saveDataVersion)` consumer (coins, stage,
// upgrades, battle pass) sees the freshly-hydrated blob instead of the empty
// pre-hydrate snapshot.

const MANIFEST_KEY = '__save_internal__crazy_keys'
const STATE_KEY = 'construct_state'

const makeFakeData = (seed: Record<string, string> = {}) => {
  const store = new Map<string, string>(Object.entries(seed))
  return {
    store,
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    removeItem: vi.fn(async (key: string) => { store.delete(key) })
  }
}

const flush = async () => { await nextTick(); await nextTick() }

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

/** A CG-cloud snapshot whose `construct_state` blob carries a full set of
 *  persisted properties, plus the meta blob the merge resolver needs to pick
 *  remote over an empty local. */
const seededCloud = async () => {
  const { META_KEY } = await import('@/utils/save/SaveMergePolicy')
  const cloudBlob = {
    epic_upgrades: { levels: { powerupDuration: 3, magnetRange: 2 } },
    epic_coins: 500,
    epic_stage: 5,
    epic_max_stage: 5,
    spinner_battle_pass: {
      xp: 40,
      unlockedStages: 3,
      claimedStages: [1, 2],
      seasonStartedAt: null
    },
    spinner_user_sound_volume: 0.4
  }
  const meta = {
    savedAt: '2026-05-19T00:00:00.000Z',
    progressScore: 5 * 500 + 5 * 150,
    schemaVersion: 1,
    maxStage: 5
  }
  return makeFakeData({
    [MANIFEST_KEY]: JSON.stringify([STATE_KEY, META_KEY]),
    [STATE_KEY]: JSON.stringify(cloudBlob),
    [META_KEY]: JSON.stringify(meta)
  })
}

const bootCloudOnly = async (data: ReturnType<typeof makeFakeData>) => {
  const { SaveManager } = await import('@/utils/save/SaveManager')
  const { CrazyGamesStrategy } = await import('@/utils/save/CrazyGamesStrategy')
  const { installSaveStatus } = await import('@/use/useSaveStatus')
  const manager = new SaveManager(
    new CrazyGamesStrategy(() => data),
    window.localStorage,
    { blob: { persistToRaw: false } }
  )
  installSaveStatus(manager)
  await manager.init()
  await flush()
  return manager
}

describe('construct_state cloud hydrate → composable refresh', () => {
  it('loads cloud upgrades into useEpicProgress after boot', async () => {
    const prog = await import('@/use/useEpicProgress')
    expect(prog.levelOf('powerupDuration')).toBe(0)

    await bootCloudOnly(await seededCloud())

    expect(prog.levelOf('powerupDuration')).toBe(3)
    expect(prog.levelOf('magnetRange')).toBe(2)
  })

  it('refreshes every saveDataVersion-backed property from the cloud blob', async () => {
    const prog = await import('@/use/useEpicProgress')
    const { default: useEpicConfig } = await import('@/use/useEpicConfig')
    const { default: useBattlePass } = await import('@/use/useBattlePass')

    const cfg = useEpicConfig()
    const bp = useBattlePass()
    const progApi = prog.default()

    await bootCloudOnly(await seededCloud())

    expect(prog.levelOf('powerupDuration')).toBe(3)
    expect(cfg.coins.value).toBe(500)
    expect(progApi.stage.value).toBe(5)
    expect(bp.unlockedStages.value).toBe(3)
    expect(bp.currentXp.value).toBe(40)
  })

  it('refreshes refs on a post-boot recovery hydrate (background retry path)', async () => {
    const prog = await import('@/use/useEpicProgress')
    const data = makeFakeData()
    const manager = await bootCloudOnly(data)
    expect(prog.levelOf('powerupDuration')).toBe(0)

    const seeded = await seededCloud()
    for (const [k, v] of seeded.store) data.store.set(k, v)

    await manager.retryHydrate()
    await flush()

    expect(prog.levelOf('powerupDuration')).toBe(3)
  })
})

describe('construct_state persistence round-trip (write → sdk.data)', () => {
  it('mirrors the whole blob (upgrades included) to sdk.data', async () => {
    const data = makeFakeData()
    const manager = await bootCloudOnly(data)

    const blob = {
      epic_upgrades: { levels: { powerupDuration: 4, coinValue: 1 } },
      epic_coins: 250,
      epic_stage: 3
    }
    window.localStorage.setItem(STATE_KEY, JSON.stringify(blob))

    await manager.flush()

    expect(data.store.get(STATE_KEY)).toBe(JSON.stringify(blob))
    const manifest = JSON.parse(data.store.get(MANIFEST_KEY)!)
    expect(manifest).toContain(STATE_KEY)

    // Round-trips: a fresh boot over the same cloud restores upgrades.
    vi.resetModules()
    localStorage.clear()
    const prog = await import('@/use/useEpicProgress')
    await bootCloudOnly(data)
    expect(prog.levelOf('powerupDuration')).toBe(4)
    expect(prog.levelOf('coinValue')).toBe(1)
  })
})
