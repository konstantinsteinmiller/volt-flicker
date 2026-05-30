import { onMounted, onUnmounted, ref } from 'vue'
import useEpicConfig from '@/use/useEpicConfig'
import { setState } from '@/use/useEpicState'
import { toggleDebug } from '@/use/useMatch'
import { STAGE_KEY } from '@/keys'

// `cheat` stays a top-level localStorage flag — it's an explicit dev toggle
// that gates the whole keyboard-shortcut module, so we don't want it living
// inside the gameplay save blob (where a cloud restore could re-enable
// cheats on a clean device).
const storedCheat = localStorage.getItem('cheat') || 'false'
const isCheat = ref<boolean>(JSON.parse(storedCheat))

// ─── Always-on key-sequence cheat: type "cmarc" to flip debug mode. ──────
//
// Sits OUTSIDE the `useCheats` factory so it works even when the regular
// cheat module is gated off — flipping `isDebug` is itself the entry point
// to dev tooling (editor button, perf meter, etc.). Module-level effect:
// runs once when this file is first imported by the gameplay tree.
const installDebugUnlock = () => {
  if (typeof window === 'undefined') return
  const target = 'cmarc'
  let buf = ''
  const isTypingTarget = (el: EventTarget | null): boolean => {
    if (!(el instanceof HTMLElement)) return false
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    return el.isContentEditable
  }
  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) { buf = ''; return }
    const k = e.key.toLowerCase()
    // Non-character keys (Shift, Tab, arrow keys) don't reset the buffer
    // outright — they just don't extend it — so the cheat survives a stray
    // modifier press. Anything else of length 1 gets appended.
    if (k.length !== 1) return
    buf = (buf + k).slice(-target.length)
    if (buf === target) {
      buf = ''
      toggleDebug()
    }
  })
}
installDebugUnlock()

const useCheats = () => {
  if (!isCheat.value) return {}

  const { addCoins } = useEpicConfig()

  // Epicancer has open-ended stages (tilesToClear scales with stage), so there
  // is no fixed STAGE_COUNT/STAGE_NAMES — just write the stage into the save
  // blob. `useEpicProgress` watches the blob and refreshes its `stage` ref; the
  // new stage takes effect on the next `resetForStage()` (next run / continue).
  const setStage = (stageId: number) => {
    if (stageId < 1) {
      console.warn(`[CHEAT] Invalid stage ${stageId}. Must be >= 1.`)
      return
    }
    setState(STAGE_KEY, stageId)
    console.warn(`[CHEAT] Stage set to ${stageId} (applies on next run).`)
  }

  const cheatsMap: Record<string, () => void> = {
    'ctrl+shift+1': () => setStage(1),
    'ctrl+shift+2': () => setStage(2),
    'ctrl+shift+3': () => setStage(3),
    'ctrl+shift+4': () => setStage(4),
    'ctrl+shift+5': () => setStage(5),
    'ctrl+shift+6': () => setStage(6),
    'ctrl+shift+7': () => setStage(7),
    'ctrl+shift+8': () => setStage(8),
    'ctrl+shift+9': () => setStage(9),
    'ctrl+shift+alt+0': () => setStage(10),
    'ctrl+shift+alt+1': () => setStage(11),
    'ctrl+shift+alt+2': () => setStage(12),
    'ctrl+shift+alt+3': () => setStage(13),
    'ctrl+shift+alt+4': () => setStage(14),
    'ctrl+shift+alt+k': () => addCoins(3000),
    'ctrl+shift+alt+t': () => {
      setState('spinner_chest_last_collected_at', 0)
      console.warn('[CHEAT] Chest cooldown reset.')
    }
  }

  const heldKeys = new Set<string>()
  const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta'])

  const normalizeKey = (e: KeyboardEvent): string | null => {
    const codeMatch = e.code.match(/^Digit(\d)$/)
    if (codeMatch) return codeMatch[1]!
    const k = e.key.toLowerCase()
    return MODIFIER_KEYS.has(k) ? null : k
  }

  const buildShortcut = (e: KeyboardEvent): string => {
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('ctrl')
    if (e.shiftKey) parts.push('shift')
    if (e.altKey) parts.push('alt')
    const sorted = [...heldKeys].sort()
    parts.push(...sorted)
    return parts.join('+')
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const key = normalizeKey(e)
    if (key) heldKeys.add(key)
    const shortcut = buildShortcut(e)
    if (cheatsMap[shortcut]) {
      e.preventDefault()
      cheatsMap[shortcut]!()
    }
  }

  const handleKeyUp = (e: KeyboardEvent) => {
    const key = normalizeKey(e)
    if (key) heldKeys.delete(key)
  }

  const handleBlur = () => {
    heldKeys.clear()
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown, { passive: false })
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    window.removeEventListener('blur', handleBlur)
  })

  return { isCheat }
}

export default useCheats
