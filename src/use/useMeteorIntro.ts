import { ref, type Ref } from 'vue'

/**
 * 3-2-1-Go countdown for the stage-start sequence. The matching meteor
 * shower flourish lives in `useMeteorShower.ts` (precomputed particle
 * pool, screen-space radial burst).
 */

export const countdownText: Ref<string> = ref('')

let countdownTimer: ReturnType<typeof setTimeout> | null = null

export const cancelCountdown = () => {
  if (countdownTimer !== null) {
    clearTimeout(countdownTimer)
    countdownTimer = null
  }
  countdownText.value = ''
}

/**
 * Run the 3-2-1-Go countdown. Each step lasts 700ms. `onDone` fires after
 * "Go" finishes, so the caller can flip the game phase to playing.
 */
export const runCountdown = (onDone: () => void) => {
  cancelCountdown()
  const steps = ['3', '2', '1', 'Go!']
  let i = 0
  const next = () => {
    if (i >= steps.length) {
      countdownText.value = ''
      countdownTimer = null
      onDone()
      return
    }
    countdownText.value = steps[i]!
    i += 1
    countdownTimer = setTimeout(next, 700)
  }
  next()
}
