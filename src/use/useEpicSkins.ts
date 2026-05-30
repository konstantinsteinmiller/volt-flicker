import { ref, computed, watch, type Ref } from 'vue'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { getState, setState, epicancerState } from '@/use/useEpicState'
import { SKINS_KEY } from '@/keys'
import useEpicConfig from '@/use/useEpicConfig'

// ─── Cosmetic ball skins ────────────────────────────────────────────────────
//
// Each skin is an equirectangular surface texture under `images/models/` that
// the renderer (`useEpicArt`) sphere-maps onto the rolling ball. Skins are
// purely cosmetic: they change appearance only, never gameplay. The default
// `eye` skin is owned for free; every other skin costs a flat coin price.
//
// Persistence lives in the single `epicancer_state` blob under `SKINS_KEY` as
// `{ owned: string[], selected: string }` — same pattern as upgrades — so it
// round-trips through the platform cloud strategies like the rest of progress.

export interface SkinDef {
  id: string
  /** Public path of the surface texture (no base-url prefix; renderer adds it). */
  src: string
  /** Display name. Cosmetic proper noun — intentionally not localized. */
  name: string
}

/** Flat coin price of any non-default skin. */
export const SKIN_COST = 500

/** The skin owned for free and selected on a fresh save. Matches the renderer's
 *  historical default texture so existing players see no change. */
export const DEFAULT_SKIN_ID = 'eye'

export const SKINS: ReadonlyArray<SkinDef> = [
  { id: 'eye', src: 'images/models/ball-eye-texture.webp', name: 'Eye' },
  { id: 'amber', src: 'images/models/ball-amber-texture.webp', name: 'Amber' },
  { id: 'gear', src: 'images/models/ball-gear-texture.webp', name: 'Gear' },
  { id: 'lava', src: 'images/models/ball-lava-texture.webp', name: 'Lava' },
  { id: 'luck', src: 'images/models/ball-luck-texture.webp', name: 'Luck' },
  { id: 'obsidian', src: 'images/models/ball-obsidian-texture.webp', name: 'Obsidian' },
  { id: 'pot', src: 'images/models/ball-pot-texture.webp', name: 'Pot' },
  { id: 'stone', src: 'images/models/ball-stone-texture.webp', name: 'Stone' }
] as const

export const skinById = (id: string): SkinDef =>
  SKINS.find((s) => s.id === id) ?? SKINS[0]!

interface SkinState { owned: string[]; selected: string }

const loadSkins = (): SkinState => {
  const v = getState<Partial<SkinState> | null>(SKINS_KEY, null)
  const validIds = new Set(SKINS.map((s) => s.id))
  const owned = new Set<string>([DEFAULT_SKIN_ID]) // default always owned
  if (v && Array.isArray(v.owned)) {
    for (const id of v.owned) if (validIds.has(id)) owned.add(id)
  }
  const selected = v && typeof v.selected === 'string' && owned.has(v.selected)
    ? v.selected
    : DEFAULT_SKIN_ID
  return { owned: [...owned], selected }
}

const skins: Ref<SkinState> = ref(loadSkins())

const refresh = (): void => { skins.value = loadSkins() }
watch(saveDataVersion, refresh)
watch(epicancerState, refresh, { deep: false })

/** Reactive id of the currently-equipped skin (consumed by the renderer). */
export const selectedSkinId = computed(() => skins.value.selected)
/** Reactive src of the currently-equipped skin's texture. */
export const selectedSkinSrc = computed(() => skinById(skins.value.selected).src)

const persist = (): void => {
  setState(SKINS_KEY, { owned: skins.value.owned, selected: skins.value.selected })
  void flushSaveNow()
}

const useEpicSkins = () => {
  const { coins, spendCoins } = useEpicConfig()

  const isOwned = (id: string): boolean => skins.value.owned.includes(id)
  const isSelected = (id: string): boolean => skins.value.selected === id
  const canBuy = (id: string): boolean =>
    !!SKINS.find((s) => s.id === id) && !isOwned(id) && coins.value >= SKIN_COST

  /** Buy a skin for `SKIN_COST` coins and equip it. No-op if already owned. */
  const buySkin = (id: string): boolean => {
    if (!canBuy(id)) return false
    if (!spendCoins(SKIN_COST)) return false
    skins.value = {
      owned: [...new Set([...skins.value.owned, id])],
      selected: id // auto-equip the freshly-bought skin
    }
    persist()
    return true
  }

  /** Equip an already-owned skin. */
  const selectSkin = (id: string): boolean => {
    if (!isOwned(id) || isSelected(id)) return false
    skins.value = { ...skins.value, selected: id }
    persist()
    return true
  }

  return {
    coins,
    skins,
    selectedSkinId,
    selectedSkinSrc,
    isOwned,
    isSelected,
    canBuy,
    buySkin,
    selectSkin,
    SKINS,
    SKIN_COST
  }
}

export default useEpicSkins
