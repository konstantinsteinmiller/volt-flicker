import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('useMawGame core mechanics', () => {
  it('initGame seeds anchor at origin and swing on the chainLength radius', async () => {
    const { default: useMawGame } = await import('@/use/useMawGame')
    const g = useMawGame()
    g.initGame()
    expect(g.anchorPos.value).toEqual({ x: 0, y: 0 })
    const swingDist = Math.hypot(g.swingPos.value.x, g.swingPos.value.y)
    expect(Math.abs(swingDist - g.chainLength.value)).toBeLessThan(1)
  })

  it('swapAnchor over open water kills the player', async () => {
    const { default: useMawGame } = await import('@/use/useMawGame')
    const g = useMawGame()
    g.initGame()
    g.startMatch()
    // Force the swing gear way off the home island so the swap drops the
    // anchor into water.
    g.swingPos.value = { x: 99999, y: 99999 }
    g.swapAnchor()
    expect(g.phase.value).toBe('game_over')
    expect(g.gameResult.value).toBe('lose')
    expect(g.lossReason.value).toBe('splashed')
  })

  it('swapAnchor over an island swaps successfully and keeps the player alive', async () => {
    const { default: useMawGame } = await import('@/use/useMawGame')
    const g = useMawGame()
    g.initGame()
    g.startMatch()
    // Home island is at (0,0) radius ~280 — swing inside the home circle
    g.swingPos.value = { x: 50, y: 0 }
    g.swapAnchor()
    expect(g.phase.value).toBe('playing')
    expect(g.anchorPos.value).toEqual({ x: 50, y: 0 })
  })

  it('reaching targetClears alone does NOT win — the player must touch the exit pole', async () => {
    const { default: useMawGame } = await import('@/use/useMawGame')
    const g = useMawGame()
    g.initGame()
    g.startMatch()
    // Park the chain far from the exit pole so the hit-test cannot fire.
    g.anchorPos.value = { x: 0, y: 0 }
    g.swingPos.value = { x: 10, y: 0 }
    g.cleared.value = g.stage.value.targetClears + 1
    g.tick(0.016)
    expect(g.phase.value).toBe('playing')
    expect(g.reqsMet.value).toBe(true)
  })

  it('touching the exit pole with requirements met wins the stage', async () => {
    const { default: useMawGame } = await import('@/use/useMawGame')
    const g = useMawGame()
    g.initGame()
    g.startMatch()
    g.cleared.value = g.stage.value.targetClears + 1
    // Drag the chain over the exit pole.
    g.anchorPos.value = { x: g.stage.value.exitX, y: g.stage.value.exitY }
    g.swingPos.value = { x: g.stage.value.exitX + 10, y: g.stage.value.exitY }
    g.tick(0.016)
    expect(g.phase.value).toBe('game_over')
    expect(g.gameResult.value).toBe('win')
  })

  it('touching the exit pole without requirements only marks it cut', async () => {
    const { default: useMawGame } = await import('@/use/useMawGame')
    const g = useMawGame()
    g.initGame()
    g.startMatch()
    g.anchorPos.value = { x: g.stage.value.exitX, y: g.stage.value.exitY }
    g.swingPos.value = { x: g.stage.value.exitX + 10, y: g.stage.value.exitY }
    g.tick(0.016)
    expect(g.phase.value).toBe('playing')
    expect(g.poleCut.value).toBe(true)
  })

  it('tick advances swing angle when playing', async () => {
    const { default: useMawGame } = await import('@/use/useMawGame')
    const g = useMawGame()
    g.initGame()
    const before = g.swingAngle.value
    g.startMatch()
    g.tick(0.5)
    expect(g.swingAngle.value).not.toBe(before)
  })

  it('tick is a no-op when phase is not playing', async () => {
    const { default: useMawGame } = await import('@/use/useMawGame')
    const g = useMawGame()
    g.initGame()
    const before = g.swingAngle.value
    g.tick(0.5)
    expect(g.swingAngle.value).toBe(before)
  })
})
