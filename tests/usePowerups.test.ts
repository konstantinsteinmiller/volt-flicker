import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('power-up durations', () => {
  it('uses the spec base durations with no upgrades', async () => {
    const { powerupDuration } = await import('@/use/usePowerups')
    expect(powerupDuration('invuln')).toBe(6)
    expect(powerupDuration('magnet')).toBe(6)
    expect(powerupDuration('dodge')).toBe(5)
    expect(powerupDuration('slowmo')).toBe(5)
    expect(powerupDuration('push')).toBe(10)
  })

  it('extends every duration by the powerupDuration upgrade', async () => {
    const prog = await import('@/use/useEpicProgress')
    const { default: useEpicConfig } = await import('@/use/useEpicConfig')
    const { powerupDuration } = await import('@/use/usePowerups')
    useEpicConfig().addCoins(10_000)
    prog.default().buyUpgrade('powerupDuration') // +0.75s
    expect(powerupDuration('invuln')).toBeCloseTo(6.75)
    expect(powerupDuration('dodge')).toBeCloseTo(5.75)
  })
})

describe('power-up activation lifecycle', () => {
  it('activates, stays active until its end, then expires', async () => {
    const { default: usePowerups } = await import('@/use/usePowerups')
    const p = usePowerups()
    p.activate('invuln', 1000)
    expect(p.isActive('invuln')).toBe(true)
    // Just before expiry (6s base → ends at 7000).
    p.update(6999)
    expect(p.isActive('invuln')).toBe(true)
    // At/after expiry.
    p.update(7000)
    expect(p.isActive('invuln')).toBe(false)
  })

  it('a fresh pickup replaces the active power-up', async () => {
    const { default: usePowerups, activePowerup } = await import('@/use/usePowerups')
    const p = usePowerups()
    p.activate('magnet', 0)
    expect(activePowerup.value?.type).toBe('magnet')
    p.activate('slowmo', 100)
    expect(activePowerup.value?.type).toBe('slowmo')
    expect(p.isActive('magnet')).toBe(false)
  })

  it('reports a sane remaining time', async () => {
    const { default: usePowerups } = await import('@/use/usePowerups')
    const p = usePowerups()
    p.activate('push', 0) // 10s
    expect(p.remainingMs(0)).toBe(10000)
    expect(p.remainingMs(2000)).toBe(8000)
    expect(p.remainingMs(99999)).toBe(0)
  })
})
