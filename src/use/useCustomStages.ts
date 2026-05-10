import { ref, type Ref } from 'vue'
import type { MawStage } from '@/use/useMawCampaign'
import { getState, setState } from '@/use/useMawState'
import overridesFromDisk from 'virtual:campaign-overrides'

/**
 * User-authored stages from the level editor.
 *
 * Two persistence layers:
 *   - `data/campaign-overrides.json` (in-repo, source-of-truth in dev) —
 *     loaded via the `virtual:campaign-overrides` virtual module and
 *     written through the dev-only `/__maw/save-override` endpoint.
 *   - localStorage (`maw_custom_stages_v1`, `maw_campaign_overrides_v1`)
 *     — fallback for production / when the dev endpoint is unavailable
 *     and for the named-stage library used by the editor's saved-stages
 *     dropdown.
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
  // Disk wins — these came from the level editor in dev (or were
  // hand-edited in the JSON file). Fall back to localStorage for any
  // slot that isn't on disk yet, so existing in-browser overrides
  // aren't lost when this codepath ships.
  const out: Record<number, MawStage> = {}
  for (const k of Object.keys(overridesFromDisk)) {
    const n = parseInt(k, 10)
    if (Number.isFinite(n)) {
      const stage = overridesFromDisk[k] as MawStage | undefined
      if (stage) out[n] = stage
    }
  }
  const ls = getState<Record<string, MawStage> | null>(CAMPAIGN_OVERRIDES_KEY, null)
  if (ls && typeof ls === 'object') {
    for (const k of Object.keys(ls)) {
      const n = parseInt(k, 10)
      if (Number.isFinite(n) && !(n in out)) out[n] = ls[k]!
    }
  }
  return out
}

const persistOverrides = (map: Record<number, MawStage>) => {
  setState(CAMPAIGN_OVERRIDES_KEY, map)
}

const saveOverrideToDisk = (id: number, stage: MawStage): void => {
  // Fire-and-forget. Dev only — production builds don't expose the
  // endpoint, so the request will fail silently and localStorage stays
  // the only persisted copy. (`import.meta.env.DEV` is statically
  // replaced, so the whole branch tree-shakes out of prod bundles.)
  if (!import.meta.env.DEV) return
  fetch('/__maw/save-override', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, stage })
  }).catch(() => { /* harmless */ })
}

const clearOverrideOnDisk = (id: number): void => {
  if (!import.meta.env.DEV) return
  fetch('/__maw/clear-override', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  }).catch(() => { /* harmless */ })
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
  const stamped = { ...stage, id }
  const next = { ...campaignOverrides.value, [id]: stamped }
  campaignOverrides.value = next
  persistOverrides(next)
  saveOverrideToDisk(id, stamped)
}

export const clearCampaignOverride = (id: number) => {
  const next = { ...campaignOverrides.value }
  delete next[id]
  campaignOverrides.value = next
  persistOverrides(next)
  clearOverrideOnDisk(id)
}
