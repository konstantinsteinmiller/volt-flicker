import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

const importMod = async () => {
  const mod = await import('@/use/useMawProgress')
  return { ...mod, useMawProgress: mod.default }
}

describe('upgrades', () => {
  it('exposes the canonical UPGRADES list', async () => {
    const { UPGRADES } = await importMod()
    expect(UPGRADES.length).toBeGreaterThan(0)
    for (const u of UPGRADES) {
      expect(typeof u.base).toBe('number')
      expect(typeof u.maxLevel).toBe('number')
    }
  })

  it('upgradedValue returns base when no levels are bought', async () => {
    const { UPGRADES, upgradedValue } = await importMod()
    const def = UPGRADES[0]!
    expect(upgradedValue(def.id)).toBe(def.base)
  })

  it('buyUpgrade increases level and cost climbs', async () => {
    const { UPGRADES, useMawProgress, levelOf, upgradeCost } = await importMod()
    const prog = useMawProgress()
    const def = UPGRADES[0]!
    const baseCost = upgradeCost(def.id)
    expect(prog.buyUpgrade(def.id)).toBe(true)
    expect(levelOf(def.id)).toBe(1)
    expect(upgradeCost(def.id)).toBeGreaterThan(baseCost)
  })

  it('refuses to buy past max level', async () => {
    const { UPGRADES, useMawProgress, levelOf } = await importMod()
    const prog = useMawProgress()
    // Pick the upgrade with the smallest cap so the loop is short — the
    // specific id doesn't matter, only the cap behaviour.
    const def = [...UPGRADES].sort((a, b) => a.maxLevel - b.maxLevel)[0]!
    for (let i = 0; i < def.maxLevel; i++) prog.buyUpgrade(def.id)
    expect(levelOf(def.id)).toBe(def.maxLevel)
    expect(prog.buyUpgrade(def.id)).toBe(false)
  })
})

describe('achievements', () => {
  it('progress unlocks once goal is reached', async () => {
    const { ACHIEVEMENTS, useMawProgress } = await importMod()
    const prog = useMawProgress()
    const ach = ACHIEVEMENTS.find(a => a.id === 'first-cut')!
    expect(prog.isAchUnlocked(ach.id)).toBe(false)
    prog.recordMetric(ach.metric, ach.goal)
    expect(prog.isAchUnlocked(ach.id)).toBe(true)
    expect(prog.isAchClaimed(ach.id)).toBe(false)
  })

  it('claimAchievement returns reward exactly once', async () => {
    const { ACHIEVEMENTS, useMawProgress } = await importMod()
    const prog = useMawProgress()
    const ach = ACHIEVEMENTS.find(a => a.id === 'first-cut')!
    prog.recordMetric(ach.metric, ach.goal)
    expect(prog.claimAchievement(ach.id)).toBe(ach.reward)
    expect(prog.claimAchievement(ach.id)).toBe(0)
  })

  it('maxStage tracks the high-water mark, never decays', async () => {
    const { useMawProgress } = await importMod()
    const prog = useMawProgress()
    prog.recordMetric('maxStage', 3)
    prog.recordMetric('maxStage', 5)
    prog.recordMetric('maxStage', 2)
    expect(prog.achievements.value.totals.maxStage).toBe(5)
  })
})
