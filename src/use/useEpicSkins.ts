import { ref, computed, watch, type Ref } from 'vue'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { getState, setState, constructState } from '@/use/useEpicState'
import { SKINS_KEY, SKINS_SEEN_KEY } from '@/keys'
import useEpicProgress from '@/use/useEpicProgress'
import useEpicConfig from '@/use/useEpicConfig'

// ─── Cosmetic ball skins ────────────────────────────────────────────────────
//
// Each skin is an equirectangular surface texture under `images/models/` that
// the renderer (`useEpicArt`) sphere-maps onto the rolling ball. Skins are
// purely cosmetic: they change appearance only, never gameplay. The default
// `stone` skin is owned for free; every other skin costs a flat coin price.
//
// Persistence lives in the single `construct_state` blob under `SKINS_KEY` as
// `{ owned: string[], selected: string }` — same pattern as upgrades — so it
// round-trips through the platform cloud strategies like the rest of progress.

/** Cosmetic rarity tier — drives the card's border colour and price weighting. */
export type SkinRarity = 'common' | 'rare' | 'epic'

export interface SkinDef {
  id: string
  /** Public path of the surface texture (no base-url prefix; renderer adds it). */
  src: string
  /** Display name. Cosmetic proper noun — intentionally not localized. */
  name: string
  /** Rarity tier (default 'common'). */
  rarity?: SkinRarity
  /** Highest-stage-ever gate: the skin can't be bought/equipped until the
   *  player has reached this stage. Omitted = available from the start. */
  unlockStage?: number
}

/** The skin owned for free and selected on a fresh save. New players start on
 *  the Stone ball. (Existing players keep whatever they already saved — only a
 *  brand-new save with no SKINS_KEY picks this up.) */
export const DEFAULT_SKIN_ID = 'stone'

/** Coin price of a skin by rarity tier. Common skins are the cheap entry point;
 *  rare and epic cost progressively more to seed cosmetic desire. */
export const SKIN_COST_BY_RARITY: Record<SkinRarity, number> = {
  common: 500,
  rare: 1000,
  epic: 1750
}

/** Coin price to buy a given skin (by id), based on its rarity tier. */
export const skinCost = (id: string): number => {
  const def = SKINS.find((s) => s.id === id)
  return SKIN_COST_BY_RARITY[def?.rarity ?? 'common']
}

// Rarity tiers seed cosmetic desire: common skins are free/cheap and available
// from the start; rare skins unlock at stage 5, epic skins at stage 10. The
// stage gate uses the player's highest stage EVER reached (progress.maxStage).
export const SKINS: ReadonlyArray<SkinDef> = [
  { id: 'eye', src: 'images/models/ball-eye-texture.webp', name: 'Eye', rarity: 'common' },
  { id: 'stone', src: 'images/models/ball-stone-texture.webp', name: 'Stone', rarity: 'common' },
  { id: 'amber', src: 'images/models/ball-amber-texture.webp', name: 'Amber', rarity: 'rare', unlockStage: 5 },
  { id: 'gear', src: 'images/models/ball-gear-texture.webp', name: 'Gear', rarity: 'rare', unlockStage: 5 },
  { id: 'luck', src: 'images/models/ball-luck-texture.webp', name: 'Luck', rarity: 'rare', unlockStage: 5 },
  { id: 'lava', src: 'images/models/ball-lava-texture.webp', name: 'Lava', rarity: 'epic', unlockStage: 10 },
  { id: 'obsidian', src: 'images/models/ball-obsidian-texture.webp', name: 'Obsidian', rarity: 'epic', unlockStage: 10 },
  { id: 'pot', src: 'images/models/ball-pot-texture.webp', name: 'Pot', rarity: 'epic', unlockStage: 10 }
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
watch(constructState, refresh, { deep: false })

/** Reactive id of the currently-equipped skin (consumed by the renderer). */
export const selectedSkinId = computed(() => skins.value.selected)
/** Reactive src of the currently-equipped skin's texture. */
export const selectedSkinSrc = computed(() => skinById(skins.value.selected).src)

const persist = (): void => {
  setState(SKINS_KEY, { owned: skins.value.owned, selected: skins.value.selected })
  void flushSaveNow()
}

// ─── "NEW!" badge bookkeeping (roadmap #12) ─────────────────────────────────
//
// Skin IDs the player has already laid eyes on in the shop. A skin that is
// unlocked (or owned) but not yet in this set shows a "NEW!" badge; opening the
// modal marks the currently-relevant skins as seen.
const loadSeen = (): string[] => {
  const v = getState<string[] | null>(SKINS_SEEN_KEY, null)
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
}
const seenSkins: Ref<string[]> = ref(loadSeen())

const useEpicSkins = () => {
  const { coins, spendCoins } = useEpicConfig()
  const progress = useEpicProgress()

  const isOwned = (id: string): boolean => skins.value.owned.includes(id)
  const isSelected = (id: string): boolean => skins.value.selected === id

  /** A skin is locked until the player's highest-ever stage meets its gate. */
  const isLocked = (id: string): boolean => {
    const def = SKINS.find((s) => s.id === id)
    if (!def?.unlockStage) return false
    return progress.maxStage.value < def.unlockStage
  }

  const canBuy = (id: string): boolean =>
    !!SKINS.find((s) => s.id === id) && !isOwned(id) && !isLocked(id) && coins.value >= skinCost(id)

  /** Show the "NEW!" badge: an unlocked skin (owned or buyable) the player
   *  hasn't seen in the shop yet. Locked skins never flash NEW. */
  const isNew = (id: string): boolean =>
    !isLocked(id) && !seenSkins.value.includes(id)

  /** Count of unlocked-but-unseen skins — drives the HUD button badge. */
  const newCount = computed(() => SKINS.filter((s) => isNew(s.id)).length)

  /** Mark every currently-unlocked skin as seen — call when the modal opens so
   *  the NEW! badges clear once the player has actually looked. */
  const markAllSeen = (): void => {
    const unlocked = SKINS.filter((s) => !isLocked(s.id)).map((s) => s.id)
    const next = [...new Set([...seenSkins.value, ...unlocked])]
    if (next.length !== seenSkins.value.length) {
      seenSkins.value = next
      setState(SKINS_SEEN_KEY, next)
      void flushSaveNow()
    }
  }

  /** Buy a skin for its rarity price and equip it. No-op if already owned or
   *  still stage-locked. */
  const buySkin = (id: string): boolean => {
    if (!canBuy(id)) return false
    if (!spendCoins(skinCost(id))) return false
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
    isLocked,
    isNew,
    newCount,
    markAllSeen,
    canBuy,
    buySkin,
    selectSkin,
    skinCost,
    SKINS
  }
}

export default useEpicSkins
