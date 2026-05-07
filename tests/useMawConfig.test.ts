import { beforeEach, describe, expect, it, vi } from 'vitest'

const stateField = (key: string): unknown => {
  const raw = localStorage.getItem('maw_state')
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return parsed?.[key]
  } catch { return undefined }
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('useMawConfig', () => {
  it('initialises coins to 0 with no stored value', async () => {
    const { default: useMawConfig } = await import('@/use/useMawConfig')
    const { coins } = useMawConfig()
    expect(coins.value).toBe(0)
  })

  it('addCoins persists and increments', async () => {
    const { default: useMawConfig } = await import('@/use/useMawConfig')
    const cfg = useMawConfig()
    cfg.addCoins(50)
    expect(cfg.coins.value).toBe(50)
    expect(stateField('spinner_coins')).toBe(50)
    cfg.addCoins(25)
    expect(cfg.coins.value).toBe(75)
  })

  it('spendCoins refuses to go negative', async () => {
    const { default: useMawConfig } = await import('@/use/useMawConfig')
    const cfg = useMawConfig()
    cfg.addCoins(20)
    expect(cfg.spendCoins(30)).toBe(false)
    expect(cfg.coins.value).toBe(20)
    expect(cfg.spendCoins(15)).toBe(true)
    expect(cfg.coins.value).toBe(5)
  })

  it('markFirstWin only flips once', async () => {
    const { default: useMawConfig } = await import('@/use/useMawConfig')
    const cfg = useMawConfig()
    expect(cfg.hasFirstWin.value).toBe(false)
    cfg.markFirstWin()
    expect(cfg.hasFirstWin.value).toBe(true)
    expect(stateField('spinner_first_win')).toBe(true)
  })
})
