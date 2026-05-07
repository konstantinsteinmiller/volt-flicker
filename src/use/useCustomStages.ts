import { ref, type Ref } from 'vue'
import type { MawStage } from '@/use/useMawCampaign'
import { getState, setState } from '@/use/useMawState'

/**
 * User-authored stages from the level editor. Persisted in localStorage as
 * a `name → MawStage` map.
 *
 * `testStage` is a non-persisted ref the editor sets before navigating to
 * the gameplay route — `useMawCampaign.currentStage` reads it and, when
 * present, plays it instead of the campaign stage.
 */

const STORE_KEY = 'maw_custom_stages_v1'
const CAMPAIGN_OVERRIDES_KEY = 'maw_campaign_overrides_v1'

const loadAll = (): Record<string, MawStage> => {
  const v = getState<Record<string, MawStage> | null>(STORE_KEY, null)
  return v && typeof v === 'object' ? v : {}
}

const persistAll = (map: Record<string, MawStage>) => {
  setState(STORE_KEY, map)
}

const loadOverrides = (): Record<number, MawStage> => {
  const v = getState<Record<string, MawStage> | null>(CAMPAIGN_OVERRIDES_KEY, null)
  if (!v || typeof v !== 'object') return {}
  // JSON keys come back as strings — coerce to numbers for lookup.
  const out: Record<number, MawStage> = {}
  for (const k of Object.keys(v)) {
    const n = parseInt(k, 10)
    if (Number.isFinite(n)) out[n] = v[k]!
  }
  return out
}

const persistOverrides = (map: Record<number, MawStage>) => {
  setState(CAMPAIGN_OVERRIDES_KEY, map)
}

export const customStages: Ref<Record<string, MawStage>> = ref(loadAll())
/** User-authored replacements for the procedural campaign stages. Keyed by
 *  stage id (1-based). When a stage id has an override here, the gameplay
 *  scene plays that override instead of the built-in. */
export const campaignOverrides: Ref<Record<number, MawStage>> = ref(loadOverrides())

/** Stage to play when set; `useMawCampaign` swaps this in for the campaign
 *  stage so the test-from-editor flow doesn't have to mutate save state. */
export const testStage: Ref<MawStage | null> = ref(null)

export const saveCustomStage = (name: string, stage: MawStage) => {
  const next = { ...customStages.value, [name]: { ...stage, name } }
  customStages.value = next
  persistAll(next)
}

export const deleteCustomStage = (name: string) => {
  const next = { ...customStages.value }
  delete next[name]
  customStages.value = next
  persistAll(next)
}

export const setTestStage = (stage: MawStage | null) => {
  testStage.value = stage
}

export const saveCampaignOverride = (id: number, stage: MawStage) => {
  // Stamp the stage id so the override matches its slot even if the editor
  // saved it with id = -1.
  const next = { ...campaignOverrides.value, [id]: { ...stage, id } }
  campaignOverrides.value = next
  persistOverrides(next)
}

export const clearCampaignOverride = (id: number) => {
  const next = { ...campaignOverrides.value }
  delete next[id]
  campaignOverrides.value = next
  persistOverrides(next)
}
