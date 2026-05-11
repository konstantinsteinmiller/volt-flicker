import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('useMawCampaign', () => {
  it('starts at stage 1', async () => {
    const { default: useMawCampaign, ensureStage } = await import('@/use/useMawCampaign')
    const { currentStageId, currentStage } = useMawCampaign()
    expect(currentStageId.value).toBe(1)
    await ensureStage(1)
    expect(currentStage.value.id).toBe(1)
  })

  it('advanceStage moves forward and persists', async () => {
    const { default: useMawCampaign } = await import('@/use/useMawCampaign')
    const { mawState } = await import('@/use/useMawState')
    const { currentStageId, advanceStage } = useMawCampaign()
    advanceStage()
    expect(currentStageId.value).toBe(2)
    // `setState` writes the in-memory blob synchronously and debounces
    // the localStorage flush by 200ms. Read the in-memory ref directly
    // — it's the same data the persist layer will eventually write.
    expect(mawState.value['spinner_campaign_stage']).toBe(2)
  })

  it('boss stages are 10, 15, 20', async () => {
    const { loadAllStages } = await import('@/use/useMawCampaign')
    const stages = await loadAllStages()
    const bossIds = stages.filter(s => s.isBoss).map(s => s.id)
    expect(bossIds).toEqual([10, 15, 20])
  })

  it('every stage has a baseline chainLength field for editor tooling', async () => {
    const { loadAllStages } = await import('@/use/useMawCampaign')
    const stages = await loadAllStages()
    for (const s of stages) {
      expect(typeof s.chainLength).toBe('number')
      expect(s.chainLength).toBeGreaterThan(0)
    }
  })

  it('every stage has at least the home island', async () => {
    const { loadAllStages } = await import('@/use/useMawCampaign')
    const stages = await loadAllStages()
    for (const s of stages) {
      expect(s.islands.length).toBeGreaterThan(0)
      expect(s.islands[0]!.cx).toBe(0)
      expect(s.islands[0]!.cy).toBe(0)
    }
  })

  it('every island in every stage is reachable from home with the baseline chain', async () => {
    const { loadAllStages } = await import('@/use/useMawCampaign')
    const stages = await loadAllStages()
    // Baseline player chain matches the upgrade base in useMawProgress.
    const PLAYER_CHAIN = 96
    for (const s of stages) {
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
    const { loadAllStages } = await import('@/use/useMawCampaign')
    const stages = await loadAllStages()
    for (const s of stages) {
      const inside = s.islands.some(isle =>
        Math.hypot(s.exitX - isle.cx, s.exitY - isle.cy) <= isle.radius + 1
      )
      expect(inside, `stage ${s.id} exit not inside any island`).toBe(true)
    }
  })

  it('every stage spaces islands apart (no shared centers)', async () => {
    const { loadAllStages } = await import('@/use/useMawCampaign')
    const stages = await loadAllStages()
    // Bounding circles overlap by design — the playable polygons (used by
    // the gameplay hit-test) are smaller than the bitmap radii, so two
    // visually distinct islands can have circle-overlap without overlapping
    // their walkable areas. We just sanity-check that no two islands share
    // a center, which would mean the builder placed one on top of another.
    for (const s of stages) {
      for (let i = 0; i < s.islands.length; i++) {
        for (let j = i + 1; j < s.islands.length; j++) {
          const a = s.islands[i]!, b = s.islands[j]!
          const d = Math.hypot(a.cx - b.cx, a.cy - b.cy)
          expect(d, `stage ${s.id} island #${i} and #${j} share a center`).toBeGreaterThan(1)
        }
      }
    }
  })
})
