import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// ─── Cloud → composable hydrate (CrazyGames) ───────────────────────────────
//
// Regression coverage for the reported bug: "upgrades are not persisted in
// the CG SDK or at least not loaded correctly".
//
// Root cause was NOT the persistence path — gameplay state lives in the
// single `maw_state` blob, which is an allowlisted payload key, so the
// CrazyGamesStrategy faithfully mirrors the whole blob (upgrades included)
// to `sdk.data`. The bug was on the LOAD side: `reloadMawState()` (the only
// thing that refreshes the in-memory blob that `getState` reads) was
// decoupled from the `saveDataVersion` bump. Composables re-read their refs
// inside `watch(saveDataVersion)` callbacks, but the blob they read from was
// still the pre-hydrate snapshot — so upgrades / achievements / battle pass
// / etc. silently fell back to defaults after a cloud restore. (Coins
// happened to survive via a bespoke `watch(mawState)` workaround in
// useMawConfig.)
//
// The fix wires `reloadMawState()` into the version bump in useSaveStatus,
// so EVERY `watch(saveDataVersion)` consumer sees the freshly-hydrated blob.
// These tests exercise the real composables against a fake `sdk.data`.

const MANIFEST_KEY = '__save_internal__crazy_keys'
const STATE_KEY = 'maw_state'

const makeFakeData = (seed: Record<string, string> = {}) => {
  const store = new Map<string, string>(Object.entries(seed))
  return {
    store,
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key)
    })
  }
}

/** Flush the Vue scheduler so module-level `watch(saveDataVersion)` /
 *  `watch(mawState)` callbacks run before we assert. */
const flush = async () => {
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

/** Build a CG-cloud snapshot whose `maw_state` blob carries a full set of
 *  persisted gameplay properties, plus the meta blob the merge resolver
 *  needs to choose remote over an empty local. */
const seededCloud = async () => {
  const { META_KEY } = await import('@/utils/save/SaveMergePolicy')
  const cloudBlob = {
    spinner_upgrades: { levels: { sawDamage: 3, maxLife: 2 } },
    spinner_coins: 500,
    spinner_campaign_stage: 5,
    spinner_achievements: {
      totals: { maxStage: 5, gamesWon: 4 },
      claimed: ['first-cut']
    },
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

/** Boot a cloud-only SaveManager (CrazyGames mode) over the given fake
 *  data module, wiring the reactive save-status bridge exactly as main.ts
 *  does (installSaveStatus BEFORE init). */
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

describe('maw_state cloud hydrate → composable refresh', () => {
  it('loads cloud upgrades into useMawProgress after boot (the reported bug)', async () => {
    // Composables import BEFORE boot so their module-level refs initialise
    // from the empty pre-hydrate blob — exactly the timing that left
    // upgrades stranded at defaults before the fix.
    const prog = await import('@/use/useMawProgress')
    expect(prog.levelOf('sawDamage')).toBe(0)

    await bootCloudOnly(await seededCloud())

    expect(prog.levelOf('sawDamage')).toBe(3)
    expect(prog.levelOf('maxLife')).toBe(2)
  })

  it('refreshes every saveDataVersion-backed property from the cloud blob', async () => {
    const prog = await import('@/use/useMawProgress')
    const { default: useMawConfig } = await import('@/use/useMawConfig')
    const { default: useBattlePass } = await import('@/use/useBattlePass')

    const cfg = useMawConfig()
    const bp = useBattlePass()
    const progApi = prog.default()

    await bootCloudOnly(await seededCloud())

    // Upgrades (the reported regression).
    expect(prog.levelOf('sawDamage')).toBe(3)
    // Coins.
    expect(cfg.coins.value).toBe(500)
    // Achievements totals.
    expect(progApi.achievements.value.totals.maxStage).toBe(5)
    expect(progApi.achievements.value.totals.gamesWon).toBe(4)
    // Battle pass.
    expect(bp.unlockedStages.value).toBe(3)
    expect(bp.currentXp.value).toBe(40)
  })

  it('refreshes refs on a post-boot recovery hydrate (background retry path)', async () => {
    // Boot against an EMPTY cloud → success-empty, refs stay at defaults.
    // Later the cloud gains data (e.g. another device saved); a manual
    // "Retry sync" / background retry must refresh the refs too. This path
    // previously had no reload at all — the one-shot dbReady reload in
    // main.ts only fires once at boot.
    const prog = await import('@/use/useMawProgress')
    const data = makeFakeData()
    const manager = await bootCloudOnly(data)
    expect(prog.levelOf('sawDamage')).toBe(0)

    // Cloud now has a save.
    const seeded = await seededCloud()
    for (const [k, v] of seeded.store) data.store.set(k, v)

    await manager.retryHydrate()
    await flush()

    expect(prog.levelOf('sawDamage')).toBe(3)
  })
})

describe('maw_state persistence round-trip (write → sdk.data)', () => {
  it('mirrors the whole maw_state blob (upgrades included) to sdk.data', async () => {
    const data = makeFakeData()
    const manager = await bootCloudOnly(data)

    // Simulate what useMawState.persist does: write the consolidated blob.
    const blob = {
      spinner_upgrades: { levels: { sawDamage: 4, chainLength: 1 } },
      spinner_coins: 250,
      spinner_campaign_stage: 3
    }
    window.localStorage.setItem(STATE_KEY, JSON.stringify(blob))

    await manager.flush()

    // The blob reached sdk.data verbatim and the manifest tracks it.
    expect(data.store.get(STATE_KEY)).toBe(JSON.stringify(blob))
    const manifest = JSON.parse(data.store.get(MANIFEST_KEY)!)
    expect(manifest).toContain(STATE_KEY)

    // And it round-trips: a fresh boot over the same cloud restores upgrades.
    vi.resetModules()
    localStorage.clear()
    const prog = await import('@/use/useMawProgress')
    await bootCloudOnly(data)
    expect(prog.levelOf('sawDamage')).toBe(4)
    expect(prog.levelOf('chainLength')).toBe(1)
  })
})
