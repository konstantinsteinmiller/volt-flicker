import { beforeEach, describe, expect, it, vi } from 'vitest'

// Pure-logic coverage for the Epicancer progression + upgrade economy.
// Each test imports fresh (vi.resetModules) so the module-singleton refs
// re-seed from a clean localStorage.

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('tilesToClear', () => {
  it('stage 1 needs 200 tiles, +100 per stage', async () => {
    const { tilesToClear } = await import('@/use/useEpicProgress')
    expect(tilesToClear(1)).toBe(200)
    expect(tilesToClear(2)).toBe(300)
    expect(tilesToClear(5)).toBe(600)
  })
})

describe('upgrade economy', () => {
  it('upgradedValue reflects base + level * perLevel', async () => {
    const prog = await import('@/use/useEpicProgress')
    const { default: useEpicConfig } = await import('@/use/useEpicConfig')
    const api = prog.default()
    expect(prog.upgradedValue('powerupDuration')).toBe(0)

    useEpicConfig().addCoins(10_000)
    expect(api.buyUpgrade('powerupDuration')).toBe(true)
    expect(prog.levelOf('powerupDuration')).toBe(1)
    expect(prog.upgradedValue('powerupDuration')).toBeCloseTo(0.75)
  })

  it('refuses a purchase the player cannot afford', async () => {
    const prog = await import('@/use/useEpicProgress')
    const api = prog.default()
    expect(api.canBuy('powerupDuration')).toBe(false)
    expect(api.buyUpgrade('powerupDuration')).toBe(false)
    expect(prog.levelOf('powerupDuration')).toBe(0)
  })

  it('locks upgrades behind their unlock stage', async () => {
    const prog = await import('@/use/useEpicProgress')
    const { default: useEpicConfig } = await import('@/use/useEpicConfig')
    const api = prog.default()
    useEpicConfig().addCoins(10_000)
    // coinValue unlocks at stage 2; the player starts at stage 1.
    expect(api.isUnlocked('coinValue')).toBe(false)
    expect(api.buyUpgrade('coinValue')).toBe(false)
  })

  it('cost grows with each level and maxes out', async () => {
    const prog = await import('@/use/useEpicProgress')
    const { default: useEpicConfig } = await import('@/use/useEpicConfig')
    const api = prog.default()
    useEpicConfig().addCoins(1_000_000)
    const c0 = prog.upgradeCost('magnetRange')
    api.buyUpgrade('magnetRange')
    const c1 = prog.upgradeCost('magnetRange')
    expect(c1).toBeGreaterThan(c0)
    // Buy to max.
    for (let i = 0; i < 10; i++) api.buyUpgrade('magnetRange')
    expect(prog.levelOf('magnetRange')).toBe(5)
    expect(prog.upgradeCost('magnetRange')).toBe(Infinity)
    expect(api.buyUpgrade('magnetRange')).toBe(false)
  })
})

describe('stage + score progression', () => {
  it('advanceStage increments stage and tracks max', async () => {
    const prog = await import('@/use/useEpicProgress')
    const api = prog.default()
    expect(api.stage.value).toBe(1)
    api.advanceStage()
    expect(api.stage.value).toBe(2)
    expect(api.maxStage.value).toBe(2)
  })

  it('recordScore only updates the personal best upward', async () => {
    const prog = await import('@/use/useEpicProgress')
    const api = prog.default()
    expect(api.recordScore(120)).toBe(true)
    expect(api.bestScore.value).toBe(120)
    expect(api.recordScore(80)).toBe(false)
    expect(api.bestScore.value).toBe(120)
  })
})
