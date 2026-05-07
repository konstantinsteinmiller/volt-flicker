import { ref, type Ref } from 'vue'

/**
 * Single-blob localStorage layer.
 *
 * Every persisted gameplay value the app touches lives inside this in-memory
 * record. Only ONE localStorage key is ever written: `maw_state`. The cloud
 * sync subsystem (SaveManager / strategies) only has to mirror this single
 * key for a complete save.
 *
 * Field names inside the record stay identical to the legacy localStorage
 * keys (`spinner_coins`, `spinner_user_language`, etc.) so the migration is
 * a straight copy and the score formula in SaveMergePolicy can read the
 * same constants from `keys.ts`.
 *
 * On first boot we run a one-shot migration:
 *   1. Read existing `maw_state` blob if present.
 *   2. Fold any legacy `spinner_*` / `maw_*` / `ca_battles_since_ad` /
 *      `__save_internal__rewarded_history` localStorage entries into the
 *      blob, then remove those entries.
 *   3. Scrub purely-dead legacy keys (`language`, `difficulty`, `volume`,
 *      `prevVolume`) — old IndexedDB-era settings the app no longer reads.
 *   4. Persist the merged blob back to `maw_state`.
 *
 * Migration is idempotent: subsequent boots find no legacy keys and skip
 * the rewrite.
 */

export const STATE_KEY = 'maw_state'

const LEGACY_PROGRESS_KEYS = [
  // Settings
  'spinner_user_language',
  'spinner_user_sound_volume',
  'spinner_user_music_volume',
  // Campaign / coins / upgrades / achievements
  'spinner_campaign_stage',
  'spinner_coins',
  'spinner_upgrades',
  'spinner_first_win',
  'spinner_achievements',
  // Daily / chest / battle pass / ad cooldown / ad cadence
  'spinner_chest_last_collected_at',
  'spinner_daily_rewards',
  'spinner_battle_pass',
  'spinner_ad_button_ready_at',
  'ca_battles_since_ad',
  // Custom stages / overrides
  'maw_custom_stages_v1',
  'maw_campaign_overrides_v1',
  // Rewarded-throttle (was under __save_internal__ to dodge cloud mirror;
  // now travels in maw_state with everything else)
  '__save_internal__rewarded_history'
] as const

const LEGACY_DEAD_KEYS = ['language', 'difficulty', 'volume', 'prevVolume'] as const

/** Persisted values used to be either bare strings ("en"), stringified
 *  numbers ("120"), or stringified JSON. JSON.parse round-trips numbers and
 *  objects; for bare strings it throws, so we fall back to the raw value. */
const tryParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

const persistRaw = (blob: Record<string, unknown>): void => {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(blob)) } catch { /* quota / private mode */ }
}

const buildInitial = (): Record<string, unknown> => {
  let blob: Record<string, unknown> = {}

  // Phase 1: load the consolidated blob if a previous run already wrote it.
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        blob = parsed as Record<string, unknown>
      }
    }
  } catch { /* corrupt → start fresh */ }

  let migrated = false

  // Phase 2: fold any legacy keys still in localStorage into the blob, then
  // remove them. The blob takes precedence if both exist (later writes win).
  for (const k of LEGACY_PROGRESS_KEYS) {
    const raw = localStorage.getItem(k)
    if (raw === null) continue
    if (!(k in blob)) blob[k] = tryParse(raw)
    try { localStorage.removeItem(k) } catch { /* harmless */ }
    migrated = true
  }

  // Phase 3: scrub purely-dead legacy keys from the IndexedDB era.
  for (const k of LEGACY_DEAD_KEYS) {
    if (localStorage.getItem(k) !== null) {
      try { localStorage.removeItem(k) } catch { /* harmless */ }
      migrated = true
    }
  }

  if (migrated) persistRaw(blob)
  return blob
}

export const mawState: Ref<Record<string, unknown>> = ref(buildInitial())

/** Read a value out of the blob. `fallback` is returned when the key is
 *  absent. Type parameter is purely advisory — the persistence layer does
 *  not validate shape. */
export const getState = <T = unknown>(key: string, fallback?: T): T => {
  const v = mawState.value[key]
  return (v === undefined ? fallback : v) as T
}

export const hasState = (key: string): boolean => mawState.value[key] !== undefined

export const setState = (key: string, value: unknown): void => {
  mawState.value = { ...mawState.value, [key]: value }
  persistRaw(mawState.value)
}

export const removeState = (key: string): void => {
  if (mawState.value[key] === undefined) return
  const next = { ...mawState.value }
  delete next[key]
  mawState.value = next
  persistRaw(mawState.value)
}

/** Re-read from localStorage. Used by the SaveManager hydrate watcher
 *  (`saveDataVersion`) so cloud-sourced updates show up in-memory. */
export const reloadMawState = (): void => {
  mawState.value = buildInitial()
}

/** Test-only: wipe both the in-memory blob and the persisted entry. */
export const __resetMawState = (): void => {
  mawState.value = {}
  try { localStorage.removeItem(STATE_KEY) } catch { /* harmless */ }
}
