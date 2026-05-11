import { ref } from 'vue'

// Maw-It-Down draws all gameplay art programmatically (via Canvas 2D)
// and uses inline SVG for HUD icons, so the asset preloader is intentionally
// empty. SFX are decoded on first play (see `useSound.ts`); the splash
// screen exits as soon as the JS bundle is parsed.

const loadingProgress = ref(100)
const areAllAssetsLoaded = ref(true)

export const resourceCache = {
  images: new Map<string, HTMLImageElement>(),
  audio: new Map<string, HTMLAudioElement>(),
  audioBuffers: new Map<string, AudioBuffer>()
}

let sharedAudioCtx: AudioContext | null = null
let resumeListenerArmed = false
let visibilityListenerArmed = false
/** Counts every active reason the audio layer should be globally
 *  silent (tab hidden, rewarded ad mid-show, interstitial mid-show).
 *  Each `suspendAllAudio()` increments, each `resumeAllAudio()`
 *  decrements; the AudioContext only resumes when the counter hits 0.
 *  This stops a "rewarded-ad finishes while the tab is hidden" race
 *  from accidentally re-unmuting the game underneath the backgrounded
 *  tab. */
let suspendDepth = 0

export const getAudioContext = (): AudioContext | null => {
  if (sharedAudioCtx) return sharedAudioCtx
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null
  try {
    sharedAudioCtx = new Ctor() as AudioContext
  } catch {
    return null
  }
  armResumeOnGesture()
  armVisibilitySuspend()
  return sharedAudioCtx
}

const armResumeOnGesture = (): void => {
  if (resumeListenerArmed) return
  resumeListenerArmed = true
  const resume = () => {
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended' && suspendDepth === 0) {
      void sharedAudioCtx.resume()
    }
  }
  window.addEventListener('pointerdown', resume, { once: true })
  window.addEventListener('keydown', resume, { once: true })
}

/** Bookkeeping for HTMLAudio elements (music, fallback SFX path) so
 *  the suspend/resume helpers can pause + restart them alongside the
 *  Web Audio context. Loops register on creation in useSound. */
const trackedAudioElements = new Set<HTMLAudioElement>()
const pausedByGlobalSuspend = new WeakSet<HTMLAudioElement>()

export const registerHtmlAudio = (el: HTMLAudioElement) => {
  trackedAudioElements.add(el)
}
export const unregisterHtmlAudio = (el: HTMLAudioElement) => {
  trackedAudioElements.delete(el)
  pausedByGlobalSuspend.delete(el)
}

/** Suspend all engine audio — Web Audio context goes to `suspended`
 *  and any registered HTMLAudio element is paused (and remembered so a
 *  later resume can restart only the ones we actually paused). Stacks:
 *  multiple `suspendAllAudio()` calls require matching `resume` calls
 *  before audio plays again. */
export const suspendAllAudio = (): void => {
  suspendDepth += 1
  if (sharedAudioCtx && sharedAudioCtx.state === 'running') {
    void sharedAudioCtx.suspend()
  }
  for (const el of trackedAudioElements) {
    if (!el.paused) {
      pausedByGlobalSuspend.add(el)
      try { el.pause() } catch { /* ignore */ }
    }
  }
}

export const resumeAllAudio = (): void => {
  suspendDepth = Math.max(0, suspendDepth - 1)
  if (suspendDepth > 0) return
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume()
  }
  for (const el of trackedAudioElements) {
    if (pausedByGlobalSuspend.has(el)) {
      pausedByGlobalSuspend.delete(el)
      void el.play().catch(() => { /* autoplay blocked / element gone */ })
    }
  }
}

const armVisibilitySuspend = (): void => {
  if (visibilityListenerArmed) return
  visibilityListenerArmed = true
  if (typeof document === 'undefined') return
  let visibilityHidden = false
  document.addEventListener('visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden'
    if (hidden && !visibilityHidden) {
      visibilityHidden = true
      suspendAllAudio()
    } else if (!hidden && visibilityHidden) {
      visibilityHidden = false
      resumeAllAudio()
    }
  })
}

export const getCachedImage = (src: string): HTMLImageElement => {
  const existing = resourceCache.images.get(src)
  if (existing) return existing
  const img = new Image()
  img.src = src
  resourceCache.images.set(src, img)
  return img
}

const pendingDecodes = new Map<string, Promise<AudioBuffer | null>>()

export const loadAudioBuffer = async (src: string): Promise<AudioBuffer | null> => {
  const cached = resourceCache.audioBuffers.get(src)
  if (cached) return cached
  const existing = pendingDecodes.get(src)
  if (existing) return existing

  const ctx = getAudioContext()
  if (!ctx) return null

  const promise = (async () => {
    try {
      const res = await fetch(src)
      if (!res.ok) return null
      const arrayBuffer = await res.arrayBuffer()
      const buffer = await ctx.decodeAudioData(arrayBuffer)
      resourceCache.audioBuffers.set(src, buffer)
      return buffer
    } catch (e) {
      console.warn(`[assets] decodeAudioData failed for ${src}`, e)
      return null
    } finally {
      pendingDecodes.delete(src)
    }
  })()
  pendingDecodes.set(src, promise)
  return promise
}

// ─── Critical art-asset preload ────────────────────────────────────────
// Anything the gameplay scene draws inside its hot path needs to be
// decoded BEFORE the first frame paints, otherwise the renderer hits
// `img.complete === false` and silently falls back to its procedural
// substitute — the player then sees a "flash" of the placeholder.
// `drawRobot` switches between two chain bitmaps (short / long) keyed
// off the live chain-upgrade level; when the player toggles between
// them mid-round, the chain bitmap that wasn't loaded yet causes that
// flash. Preloading both eliminates the swap pop.
const CRITICAL_IMAGE_SRCS: ReadonlyArray<string> = [
  '/images/props/chain_256x256.webp',
  '/images/props/chain_450x256.webp',
  '/images/props/gear_256x256.webp',
  // Splash logo — decoded before the splash mounts so the FLogoProgress
  // <img> never paints a blank box on first frame.
  '/images/logo/logo_256x256.webp'
]

/** Block until `img.complete && naturalWidth > 0` (success) or `error`
 *  fires (failure). Cached images that already decoded resolve
 *  synchronously on the next microtask. */
const decodeImage = (src: string): Promise<void> => {
  const img = getCachedImage(src)
  if (img.complete && img.naturalWidth > 0) return Promise.resolve()
  return new Promise<void>(resolve => {
    const done = () => {
      img.removeEventListener('load', done)
      img.removeEventListener('error', done)
      resolve()
    }
    img.addEventListener('load', done, { once: true })
    img.addEventListener('error', done, { once: true })
  })
}

export default () => {
  const preloadAssets = async (): Promise<void> => {
    loadingProgress.value = 0
    areAllAssetsLoaded.value = false
    // Stage build runs in parallel with the critical-image decode.
    // Without this, the splash hides as soon as the bitmaps land but the
    // first frame still has to wait on the procedural stage build, which
    // can spike ~30-80 ms on mid-tier mobile. We block on the stage the
    // player will actually see — `currentStageId` (saved progress, may be
    // 1 for first-timers or N for resumes).
    //
    // The dynamic import keeps the gameplay-code chunk off the entry
    // bundle. The shared chunk that contains useMawCampaign / useMawArt /
    // useMawGame loads in PARALLEL with the static splash render — so the
    // player sees the bg-tile and animated logo immediately while the
    // gameplay bytes stream in. `useStageBuilder` is a second-level lazy
    // chunk (dynamic-imported by `useMawCampaign.ensureStage`) so the
    // procedural build code is its own ~10 kB chunk.
    const stageTask = (async () => {
      const campaign = await import('@/use/useMawCampaign')
      const { currentStageId } = campaign.default()
      await campaign.ensureStage(currentStageId.value)
    })()
    // Kick decoding in parallel; resolve when every critical sprite is
    // ready. `Promise.allSettled` swallows individual asset errors so a
    // 404 on one bitmap doesn't strand the splash screen.
    const imageTasks = CRITICAL_IMAGE_SRCS.map(decodeImage)
    const tasks: Promise<unknown>[] = [...imageTasks, stageTask]
    let done = 0
    for (const task of tasks) {
      task.then(() => {
        done += 1
        loadingProgress.value = Math.round((done / tasks.length) * 100)
      })
    }
    await Promise.allSettled(tasks)
    loadingProgress.value = 100
    areAllAssetsLoaded.value = true
  }

  return {
    loadingProgress,
    areAllAssetsLoaded,
    preloadAssets,
    resourceCache
  }
}
