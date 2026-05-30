// Background SFX preload — fires AFTER first paint so it never competes
// with the critical path.
//
// Without this, every SFX pays its first-play decode cost the moment the
// game fires it (grass-cut #1 stutters on the first mow, the chain-loop
// silences for a beat on round start). The decode is cheap individually
// (1-5 ms per .ogg) but happens in a flurry of small bursts during the
// opening seconds of gameplay — exactly when the player is forming a
// first impression. Decoding everything once, on an idle callback,
// pushes that work off the rendering thread before it gets noticed.
//
// `loadAudioBuffer` is idempotent — repeat calls hit the cache or join
// the pending decode promise, so it's safe to call this preload more
// than once (e.g. on every MawScene mount). The visibility-hidden /
// ad-show suspend system in `useAssets.ts` doesn't affect decode — it
// only gates playback — so this works correctly even if the tab is
// backgrounded during preload.

import { prependBaseUrl } from '@/utils/function'
import { loadAudioBuffer } from '@/use/useAssets'

// Every SFX the gameplay scene can fire. Kept as a flat list so a single
// allSettled covers them all. Order doesn't matter — they decode in
// parallel and fight for the AudioContext's decoder pool. Adding a new
// SFX = add the basename here (no `.ogg`, no path prefix).
const GAMEPLAY_SFX: ReadonlyArray<string> = [
  'mow-loop',
  'grass-cut-1',
  'grass-cut-2',
  'grass-cut-3',
  'wood-cut',
  'stone-cut',
  'crystal-cut',
  'obstacle-hit',
  'anchor-swap',
  'coin-pickup',
  'chainsaw-break',
  'plastic-torn-1',
  'plastic-torn-2',
  'water-splash',
  'gravity',
  'dodge',
  'shrapnel',
  'lose',
  'win',
  'modal-open',
  'level-up',
  'reward-continue',
  'happy'
]

let preloadStarted = false

/** Kick off background decode of every gameplay SFX. Idempotent; calling
 *  twice is a no-op after the first invocation. Caller is responsible
 *  for scheduling this off the critical path — typically inside an
 *  `onMounted` + `requestIdleCallback` from MawScene. */
export const preloadGameplaySounds = (): void => {
  if (preloadStarted) return
  preloadStarted = true
  for (const name of GAMEPLAY_SFX) {
    // Fire-and-forget; the individual promise rejection is swallowed by
    // `loadAudioBuffer`. No `Promise.allSettled` needed — we don't have
    // a join point, the cache hits land as they finish.
    void loadAudioBuffer(prependBaseUrl(`audio/sfx/${name}.ogg`))
  }
}

/** Schedule `preloadGameplaySounds()` on the first available idle slot.
 *  Falls back to `setTimeout(0)` on browsers that don't expose
 *  `requestIdleCallback` (mostly Safari). Either path runs after the
 *  current animation frame so the first paint isn't delayed. */
export const schedulePreloadOnIdle = (): void => {
  if (preloadStarted) return
  if (typeof window === 'undefined') return
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined
  if (typeof ric === 'function') {
    ric(() => preloadGameplaySounds(), { timeout: 2000 })
  } else {
    setTimeout(() => preloadGameplaySounds(), 0)
  }
}
