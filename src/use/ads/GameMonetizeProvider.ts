// GameMonetize.com ad provider — wraps the lazy-loaded `gameMonetizePlugin`
// in the cross-platform `AdProvider` surface consumed by `useAds`.
//
// Imports of the plugin module are STATIC, even though dynamic imports look
// tempting — if the project runs `vite-plugin-javascript-obfuscator`, its
// `stringArray` transform rewrites the literal `'@/...'` inside dynamic imports
// so the browser throws "Failed to resolve module specifier" at runtime. A
// static import is detected by Rollup before the obfuscator runs, and
// tree-shaking eliminates the plugin code entirely in non-GameMonetize builds
// (because `resolveAdProvider` only references this provider when
// `flags.isGameMonetize` is true, which `import.meta.env` resolves to a static
// `false` for other build modes). Same rationale as the GameDistribution /
// Playgama providers.
//
// NOTE: no `ownsAdBlockUi` here — GameMonetize relies on the shared in-game
// `AdsBlockedModal` (only CrazyGames owns its own ad-block popup). Combined with
// `isGmAdsBlocked`, a failed rewarded tap surfaces that modal.

import { computed, ref } from 'vue'
import type { AdProvider } from './types'

// Dynamic import — keeps the heavy `gameMonetizePlugin` module (which
// contains the literal ad-block probe URL `https://s0.2mdn.net/instream/
// video/client.js`) off non-GameMonetize builds. On a Yandex build the
// `createGameMonetizeProvider` factory is never called (the env-gated arm
// in `resolveAdProvider` is dead), so Rollup emits no chunk for the
// plugin and the `2mdn.net` URL stays out of the bundle — required by
// Yandex's moderation ("Service storage URL detected").
//
// This file is in `vite-plugin-javascript-obfuscator`'s exclude list so
// the dynamic-import literal survives Vite's transform pipeline.

type GameMonetizeModule = typeof import('@/utils/gameMonetizePlugin')
let gmModule: GameMonetizeModule | null = null
const loadGameMonetize = async (): Promise<GameMonetizeModule> => {
  if (!gmModule) gmModule = await import('@/utils/gameMonetizePlugin')
  return gmModule
}

const isReadyFallback = ref(false)
const isAdsBlockedFallback = ref(false)

export const createGameMonetizeProvider = (): AdProvider => {
  const isReady = computed(() => gmModule?.isGmSdkActive.value ?? isReadyFallback.value)
  const isAdsBlocked = computed(() => gmModule?.isGmAdsBlocked.value ?? isAdsBlockedFallback.value)
  return {
    name: 'gamemonetize',
    isReady,
    // Per-format readiness is driven by a REAL fill signal (resolved
    // `preloadAd('rewarded')` on preload-supported builds, or the cooldown
    // predictor on preload-absent). Until the plugin loads, fall back to
    // false so the watch-ad button stays hidden on Yandex.
    isRewardedReady: computed(() =>
      (gmModule?.isGmSdkActive.value ?? false)
      && (gmModule?.isGmRewardedFilled.value ?? false)
      && !(gmModule?.isGmAdCoolingDown.value ?? false)
    ),
    isInterstitialReady: computed(() =>
      (gmModule?.isGmSdkActive.value ?? false)
      && !(gmModule?.isGmAdCoolingDown.value ?? false)
    ),
    isAdsBlocked,
    init: async () => {
      try {
        const m = await loadGameMonetize()
        await m.gameMonetizePlugin()
      } catch (e) {
        console.warn('[ads/gamemonetize] plugin init failed', e)
      }
    },
    showRewardedAd: async () => {
      const m = await loadGameMonetize()
      return m.showRewardedAdGM()
    },
    showMidgameAd: async () => {
      const m = await loadGameMonetize()
      return m.showMidgameAdGM()
    }
  }
}
