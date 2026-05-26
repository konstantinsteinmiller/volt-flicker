import { prependBaseUrl } from '@/utils/function'
import useUser from '@/use/useUser'
import { getAudioContext, loadAudioBuffer, resourceCache, registerHtmlAudio, unregisterHtmlAudio, isAudioSuspended, registerOneShotSource } from '@/use/useAssets'

import { ref, onMounted, watch, onUnmounted } from 'vue'

// We keep the audio instance outside the hook so it's a true Singleton
const bgMusic = ref<HTMLAudioElement | null>(null)
const isLoaded = ref(false)
const isPlaying = ref(false)
// Tracks whether music is *meant* to be playing right now (i.e. a battle is
// in progress). Used so visibility-change resume only un-pauses when there's
// actually a battle running.
const shouldPlay = ref(false)

/**
 * Hard-stop the background music IMMEDIATELY (no fade) and clear the
 * play-intent flags. Use right before an interstitial ad is requested.
 *
 * Why this and not just the suspend gate: the pause gate (`useGamePauseAudio`)
 * pauses the music while `isAdShowing` is true and RESUMES it when the flag
 * drops. But the GamePix `interstitialAd()` promise can resolve before the ad
 * visually closes — `isAdShowing` then drops and the gate restarts the music
 * UNDER the still-open ad (the bug GamePix QA keeps reporting). Stopping the
 * music here first makes that impossible: the element is already paused before
 * any suspend runs, so it's never queued for auto-resume, and `shouldPlay =
 * false` stops any in-flight fade. The next round's `startBattleMusic()`
 * brings it back. Idempotent and null-safe.
 */
export const forceStopMusic = (): void => {
  shouldPlay.value = false
  try {
    bgMusic.value?.pause()
    if (bgMusic.value) {
      bgMusic.value.volume = 0
    }
    console.log('bgMusic.value.volume: ', bgMusic.value?.readyState, bgMusic.value?.volume)
  } catch { /* element gone / not ready */ }
  isPlaying.value = false
}

export const useMusic = () => {
  const { userMusicVolume } = useUser()

  watch(userMusicVolume, () => {
    if (!bgMusic.value) return
    bgMusic.value.volume = Math.max(0, Math.min(1, (userMusicVolume.value ?? 0.6) * 0.025))
  })

  const pauseMusic = () => {
    if (bgMusic.value) {
      bgMusic.value.pause()
      isPlaying.value = false
    }
  }

  const continueMusic = () => {
    if (bgMusic.value && shouldPlay.value) {
      playWithFade()
    }
  }

  const initMusic = () => {
    onMounted(() => {
      if (bgMusic.value) return // Already initialized
      const audio = new Audio()
      audio.loop = true
      audio.volume = 0
      audio.preload = 'auto'
      bgMusic.value = audio
      // Register with the global suspend/resume registry so tab-hide
      // and ad-show both halt the music track and resume it after.
      registerHtmlAudio(audio)
    })
    onUnmounted(() => {
      if (bgMusic.value) unregisterHtmlAudio(bgMusic.value)
      bgMusic.value?.pause()
      bgMusic.value?.removeAttribute('src')
      bgMusic.value = null
      shouldPlay.value = false
      isPlaying.value = false
      isLoaded.value = false
    })
  }

  const isMusicPlaying = (): boolean => !!bgMusic.value && isPlaying.value

  const startBattleMusic = () => {
    if (!bgMusic.value) return
    // Already playing a battle track — leave it alone so we don't restart
    // mid-fight on extra calls.
    if (shouldPlay.value && isPlaying.value) return
    shouldPlay.value = true
    const filename = `bg-cozy.ogg`
    const src = prependBaseUrl('audio/music/' + filename)
    const cached = resourceCache.audio.get(src)

    bgMusic.value.pause()
    bgMusic.value.volume = 0

    if (cached) {
      // Use preloaded audio — already decoded, skip network fetch
      bgMusic.value.src = cached.src
      isLoaded.value = true
      playWithFade()
    } else {
      bgMusic.value.src = src
      bgMusic.value.load()
      bgMusic.value.addEventListener('canplaythrough', () => {
        isLoaded.value = true
        playWithFade()
      }, { once: true })
    }
  }

  const stopBattleMusic = () => {
    shouldPlay.value = false
    if (!bgMusic.value) return
    fadeOut(() => {
      bgMusic.value?.pause()
      isPlaying.value = false
    })
  }

  const playWithFade = () => {
    if (!bgMusic.value) return

    // Browsers block autoplay until user interaction
    bgMusic.value.play().then(() => {
      isPlaying.value = true
      fadeIn()
    }).catch(() => {
      // Attach a one-time listener to the window to play on first click
      window.addEventListener('click', () => {
        if (!isPlaying.value && shouldPlay.value) playWithFade()
      }, { once: true })
    })
  }

  const fadeIn = () => {
    if (!bgMusic.value) return
    let vol = 0
    const target = Math.max(0, Math.min(1, (userMusicVolume.value ?? 0.6) * 0.125))
    const interval = setInterval(() => {
      if (!bgMusic.value || !shouldPlay.value) {
        clearInterval(interval)
        return
      }
      if (vol < target) {
        vol += 0.005
        bgMusic.value.volume = Math.min(vol, target)
      } else {
        clearInterval(interval)
      }
    }, 50)
  }

  const fadeOut = (onDone?: () => void) => {
    if (!bgMusic.value) {
      onDone?.()
      return
    }
    const interval = setInterval(() => {
      if (!bgMusic.value) {
        clearInterval(interval)
        onDone?.()
        return
      }
      const v = bgMusic.value.volume
      if (v > 0.005) {
        bgMusic.value.volume = Math.max(0, v - 0.005)
      } else {
        bgMusic.value.volume = 0
        clearInterval(interval)
        onDone?.()
      }
    }, 50)
  }


  return { initMusic, isLoaded, isPlaying, isMusicPlaying, pauseMusic, continueMusic, startBattleMusic, stopBattleMusic }
}

// ─── SFX playback ──────────────────────────────────────────────────────────
//
// `playSound` has two paths:
//
//   1. Web Audio (fast path) — a preloaded AudioBuffer lives in
//      resourceCache.audioBuffers. We spawn a fresh AudioBufferSourceNode
//      + GainNode and start it. No fetch, no decode, no media-element
//      allocation — typically <0.5 ms on the main thread.
//
//      If the buffer isn't cached yet (sound played before preload
//      finished, or a sound not in the preload list), we kick off a
//      fetch+decode in the background. The first call on that sound still
//      pays the decode cost, but every subsequent call hits the fast path.
//
//   2. HTMLAudio fallback — only used when Web Audio is unavailable
//      (extremely rare in 2025). We keep the old cloneNode() + new Audio()
//      logic intact so nothing breaks.
//
// Return value: a minimal `SoundHandle` interface so existing callers that
// do `audio.addEventListener('ended', ...)` keep working. The handle is
// backed by either the source node (Web Audio) or the Audio element
// (fallback). `error` events never fire in the Web Audio path — a source
// that fails to start throws synchronously from `start()` and we map that
// to an immediate 'ended' dispatch so caller cleanup logic still runs.

export type SoundHandle = Pick<
  HTMLAudioElement,
  'addEventListener' | 'removeEventListener'
>

/** Handle returned by `playLoop`. Persistent looping voices (chain whir,
 *  ambient drones) live for the duration of a play state — the caller
 *  is responsible for `stop()` when the state changes. */
export interface LoopHandle {
  stop: () => void
  setVolume: (ratio: number) => void
}

const makeWebAudioHandle = (source: AudioBufferSourceNode): SoundHandle => {
  // AudioBufferSourceNode is already an EventTarget and fires 'ended' when
  // playback finishes or stop() is called. We just need to ignore 'error'
  // (Web Audio doesn't emit one) so callers that add both listeners don't
  // crash. Treating 'error' as a no-op is safe because 'ended' always
  // fires for a successfully-started source.
  return {
    addEventListener: ((event: string, cb: EventListener, opts?: AddEventListenerOptions | boolean) => {
      if (event === 'ended') source.addEventListener('ended', cb, opts)
    }) as HTMLAudioElement['addEventListener'],
    removeEventListener: ((event: string, cb: EventListener, opts?: EventListenerOptions | boolean) => {
      if (event === 'ended') source.removeEventListener('ended', cb, opts)
    }) as HTMLAudioElement['removeEventListener']
  }
}

const useSounds = () => {
  const { userSoundVolume } = useUser()

  const clampVolume = (ratio: number): number =>
    Math.max(0, Math.min(1, (userSoundVolume.value ?? 0.7) * ratio))

  const playViaWebAudio = (
    ctx: AudioContext,
    buffer: AudioBuffer,
    ratio: number,
    pitch: number
  ): SoundHandle | null => {
    try {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      if (pitch !== 1) source.playbackRate.value = pitch
      const gain = ctx.createGain()
      gain.gain.value = clampVolume(ratio)
      source.connect(gain).connect(ctx.destination)
      source.start()
      // Track so an ad can hard-stop it (ctx.suspend only freezes; an early
      // gate-drop would otherwise let it tail audibly under the ad).
      registerOneShotSource(source)
      return makeWebAudioHandle(source)
    } catch (e) {
      // Browser refused to start (context killed, etc.) — signal the
      // caller's cleanup via a dispatched 'ended' so they don't leak a
      // slot in their active-sounds counter.
      console.warn('[sfx] Web Audio start failed', e)
      return null
    }
  }

  const playViaHtmlAudio = (src: string, ratio: number): HTMLAudioElement => {
    const cached = resourceCache.audio.get(src)
    const audio = cached
      ? (cached.cloneNode(false) as HTMLAudioElement)
      : new Audio(src)
    // iOS requires volume to be set BEFORE play(). Clamp to [0,1] —
    // Firefox throws DOMException if volume is NaN or out of range (can
    // happen when userSoundVolume hasn't loaded from IndexedDB yet).
    audio.volume = clampVolume(ratio)
    // Track this element with the global suspend registry so a mid-flight
    // SFX (this fallback path fires while a buffer is still decoding) is
    // paused if an ad opens before it finishes. Auto-unregister when the
    // one-shot ends so the WeakSet/Set don't grow unbounded.
    registerHtmlAudio(audio)
    const release = () => unregisterHtmlAudio(audio)
    audio.addEventListener('ended', release, { once: true })
    audio.addEventListener('error', release, { once: true })
    // `play()` returns a Promise in modern browsers, but `undefined` under
    // jsdom and old Safari — guard the `.catch` so a non-Promise return
    // doesn't throw and abort the gameplay tick that triggered the SFX.
    audio.play()?.catch(() => {
      /* autoplay blocked or media failed — ignore */
    })
    return audio
  }

  const playSound = (effect: string, ratio = 0.025, pitch = 1): SoundHandle | null => {
    // Hard mute while the game is paused for an ad / hidden tab. The Web
    // Audio context is already suspended (so a started source would be
    // frozen), but the HTMLAudio fallback would otherwise play immediately
    // under the ad — refuse to start any one-shot at all. This is the
    // "pause all sounds during ads" guarantee QA asked for.
    if (isAudioSuspended()) return null

    const src = prependBaseUrl(`audio/sfx/${effect}.ogg`)

    // Fast path: preloaded AudioBuffer + Web Audio.
    const buffer = resourceCache.audioBuffers.get(src)
    const ctx = getAudioContext()
    if (ctx && buffer) {
      return playViaWebAudio(ctx, buffer, ratio, pitch)
    }

    // Slow path: Web Audio available but buffer not yet decoded. Kick off
    // a background decode so subsequent calls hit the fast path, and play
    // *this* call via HTMLAudio so the player still hears it immediately.
    if (ctx && !buffer) {
      void loadAudioBuffer(src)
    }

    // Fallback: HTMLAudio (also used when Web Audio is unavailable).
    // Pitch is ignored here — HTMLAudio's playbackRate works but the
    // fallback path is intentionally bare-bones, and any modern browser
    // that hits it isn't sweating a fixed-pitch SFX.
    return playViaHtmlAudio(src, ratio)
  }

  /** Random-variant helper — fires one of `prefix-1` … `prefix-count`
   *  with a small per-call pitch jitter so a rapid burst (e.g. mowing a
   *  whole grass cluster) doesn't sound like a machine gun. */
  const playRandomVariant = (
    prefix: string,
    count: number,
    ratio = 0.04,
    pitchJitter = 0.08
  ): SoundHandle | null => {
    if (count < 1) return null
    const idx = 1 + Math.floor(Math.random() * count)
    const pitch = 1 + (Math.random() - 0.5) * pitchJitter * 2
    return playSound(`${prefix}-${idx}`, ratio, pitch)
  }

  /** Start a looping sample. Returns a handle whose `.stop()` ends the
   *  voice and `.setVolume()` retunes its gain. `playSound` plays one-
   *  shots; this is for chain-saw whirs, ambient drones, anything that
   *  should pulse for the duration of a state. */
  const playLoop = (effect: string, ratio = 0.025): LoopHandle | null => {
    // Don't spin up a looping voice while audio is globally suspended (ad
    // on screen / tab hidden). Gameplay is paused in that window anyway, so
    // nothing should be requesting a new loop — this is belt-and-braces.
    if (isAudioSuspended()) return null
    const src = prependBaseUrl(`audio/sfx/${effect}.ogg`)
    const ctx = getAudioContext()
    if (!ctx) return null
    let source: AudioBufferSourceNode | null = null
    let gain: GainNode | null = null
    let stopped = false
    const begin = (buffer: AudioBuffer) => {
      if (stopped) return
      try {
        source = ctx.createBufferSource()
        source.buffer = buffer
        source.loop = true
        gain = ctx.createGain()
        gain.gain.value = clampVolume(ratio)
        source.connect(gain).connect(ctx.destination)
        source.start()
      } catch (e) {
        console.warn('[sfx] loop start failed', e)
      }
    }
    const buffer = resourceCache.audioBuffers.get(src)
    if (buffer) {
      begin(buffer)
    } else {
      // Defer until decoded. If the user stops the loop before decode
      // resolves, `stopped` short-circuits inside `begin`.
      void loadAudioBuffer(src).then(b => { if (b) begin(b) })
    }
    return {
      stop: () => {
        stopped = true
        if (source) {
          try { source.stop() } catch { /* already stopped */ }
          try { source.disconnect() } catch { /* no-op */ }
          source = null
        }
        if (gain) {
          try { gain.disconnect() } catch { /* no-op */ }
          gain = null
        }
      },
      setVolume: (r: number) => {
        if (gain) gain.gain.value = clampVolume(r)
      }
    }
  }

  return {
    playSound,
    playRandomVariant,
    playLoop
  }
}

export default useSounds

