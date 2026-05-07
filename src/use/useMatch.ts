import { ref } from 'vue'

const debugSaved = localStorage.getItem('debug') || 'false'
const envDebug = import.meta.env.VITE_APP_DEBUG === 'true'
const isProductionBuild = import.meta.env.VITE_NODE_ENV === 'production'
export const isDebug = ref(envDebug || (!isProductionBuild && !!JSON.parse(debugSaved)))
export const isCrazyGamesFullRelease = import.meta.env.VITE_APP_CRAZY_GAMES_FULL_RELEASE === 'true'

/** Flip `isDebug` and persist the new value under the bare `debug` key.
 *  The "cmarc" cheat sequence calls this so the dev can pop into debug
 *  mode mid-session without a reload — every consumer that binds to
 *  `isDebug` (editor button, perf meter, etc.) reacts immediately. */
export const toggleDebug = (): boolean => {
  const next = !isDebug.value
  isDebug.value = next
  try { localStorage.setItem('debug', JSON.stringify(next)) } catch { /* harmless */ }
  console.warn(`[cheat] Debug mode ${next ? 'ENABLED' : 'DISABLED'}.`)
  return next
}

export const isSplashScreenVisible = ref<boolean>(false)
export const isDbInitialized = ref<boolean>(false)

export const useMatch = () => {
  const turn = ref<'player' | 'npc'>('player')
  const isThinking = ref(false)

  const resetGame = () => {}

  return {
    turn,
    resetGame,
    isThinking
  }
}

export default useMatch
