import { ref, watch, type Ref } from 'vue'
import { saveDataVersion } from '@/use/useSaveStatus'
import { COINS_KEY } from '@/keys'
import { getState, setState, mawState } from '@/use/useMawState'

const FIRST_WIN_KEY = 'spinner_first_win'

// Coins are stored as a plain number now; legacy migration in useMawState
// turns the old "120" string into 120 via JSON.parse. `Number(v)` falls back
// to 0 for any malformed leftover.
const readNumber = (key: string, fallback: number): number => {
  const v = getState<unknown>(key)
  if (v === undefined || v === null) return fallback
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : fallback
}

const readBool = (key: string, fallback = false): boolean => {
  const v = getState<unknown>(key)
  if (v === undefined || v === null) return fallback
  return v === true || v === 1 || v === '1' || v === 'true'
}

const coins: Ref<number> = ref(readNumber(COINS_KEY, 0))
const hasFirstWin: Ref<boolean> = ref(readBool(FIRST_WIN_KEY))

watch(saveDataVersion, () => {
  coins.value = readNumber(COINS_KEY, coins.value)
  hasFirstWin.value = readBool(FIRST_WIN_KEY, hasFirstWin.value)
})

// Cloud sync writes back into mawState — track its identity so refs stay
// in sync without piggybacking on `saveDataVersion`.
watch(mawState, () => {
  coins.value = readNumber(COINS_KEY, coins.value)
  hasFirstWin.value = readBool(FIRST_WIN_KEY, hasFirstWin.value)
}, { deep: false })

const useMawConfig = () => {
  const addCoins = (amount: number) => {
    if (!Number.isFinite(amount)) return
    coins.value = Math.max(0, Math.floor(coins.value + amount))
    setState(COINS_KEY, coins.value)
  }

  const spendCoins = (amount: number): boolean => {
    if (amount < 0 || coins.value < amount) return false
    coins.value -= amount
    setState(COINS_KEY, coins.value)
    return true
  }

  const markFirstWin = () => {
    if (hasFirstWin.value) return
    hasFirstWin.value = true
    setState(FIRST_WIN_KEY, true)
  }

  return {
    coins,
    hasFirstWin,
    addCoins,
    spendCoins,
    markFirstWin
  }
}

export default useMawConfig
