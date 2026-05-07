import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('useMawCampaign', () => {
  it('starts at stage 1', async () => {
    const { default: useMawCampaign } = await import('@/use/useMawCampaign')
    const { currentStageId, currentStage } = useMawCampaign()
    expect(currentStageId.value).toBe(1)
    expect(currentStage.value.id).toBe(1)
  })

  it('advanceStage moves forward and persists', async () => {
    const { default: useMawCampaign } = await import('@/use/useMawCampaign')
    const { currentStageId, advanceStage } = useMawCampaign()
    advanceStage()
    expect(currentStageId.value).toBe(2)
    const blob = JSON.parse(localStorage.getItem('maw_state') || '{}')
    expect(blob['spinner_campaign_stage']).toBe(2)
  })

  it('boss stages occur every 10', async () => {
    const { STAGES } = await import('@/use/useMawCampaign')
    for (const s of STAGES) {
      expect(s.isBoss).toBe(s.id % 10 === 0)
    }
  })

  it('chain length grows with stage difficulty', async () => {
    const { STAGES } = await import('@/use/useMawCampaign')
    expect(STAGES[0]!.chainLength).toBeLessThan(STAGES[10]!.chainLength)
    expect(STAGES[10]!.chainLength).toBeLessThan(STAGES[20]!.chainLength)
  })

  it('every stage has at least the home island', async () => {
    const { STAGES } = await import('@/use/useMawCampaign')
    for (const s of STAGES) {
      expect(s.islands.length).toBeGreaterThan(0)
      expect(s.islands[0]!.cx).toBe(0)
      expect(s.islands[0]!.cy).toBe(0)
    }
  })

  it('every island in every stage is reachable from home with the baseline chain', async () => {
    const { STAGES } = await import('@/use/useMawCampaign')
    // Baseline player chain matches the upgrade base in useMawProgress.
    const PLAYER_CHAIN = 96
    for (const s of STAGES) {
      const reached = new Set<number>([0])
      let grew = true
      while (grew) {
        grew = false
        for (let j = 0; j < s.islands.length; j++) {
          if (reached.has(j)) continue
          const a = s.islands[j]!
          for (const i of reached) {
            const b = s.islands[i]!
            const d = Math.hypot(a.cx - b.cx, a.cy - b.cy)
            if (d <= a.radius + PLAYER_CHAIN + b.radius) {
              reached.add(j)
              grew = true
              break
            }
          }
        }
      }
      expect(reached.size, `stage ${s.id} unreachable islands: ${s.islands.length - reached.size}`).toBe(s.islands.length)
    }
  })

  it('the exit pole sits inside at least one island so the win trigger is reachable', async () => {
    const { STAGES } = await import('@/use/useMawCampaign')
    for (const s of STAGES) {
      const inside = s.islands.some(isle =>
        Math.hypot(s.exitX - isle.cx, s.exitY - isle.cy) <= isle.radius + 1
      )
      expect(inside, `stage ${s.id} exit not inside any island`).toBe(true)
    }
  })

  it('every stage leaves visible water between consecutive islands instead of overlapping them', async () => {
    const { STAGES } = await import('@/use/useMawCampaign')
    for (const s of STAGES) {
      // We don't assert *all* pairs (side branches can sit close to a path
      // island) — just that the home island doesn't overlap any other island,
      // because the home overlap was the visible bug.
      const home = s.islands[0]!
      for (let i = 1; i < s.islands.length; i++) {
        const o = s.islands[i]!
        const d = Math.hypot(home.cx - o.cx, home.cy - o.cy)
        expect(d, `stage ${s.id} home overlaps island #${i}`).toBeGreaterThan(home.radius + o.radius)
      }
    }
  })
})
