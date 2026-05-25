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

import { computed } from 'vue'
import {
  gameMonetizePlugin,
  isGmAdCoolingDown,
  isGmAdsBlocked,
  isGmRewardedFilled,
  isGmSdkActive,
  showMidgameAdGM,
  showRewardedAdGM
} from '@/utils/gameMonetizePlugin'
import type { AdProvider } from './types'

export const createGameMonetizeProvider = (): AdProvider => {
  const isReady = computed(() => isGmSdkActive.value)
  return {
    name: 'gamemonetize',
    isReady,
    // Per-format readiness is now driven by a REAL fill signal, not the coarse
    // SDK-active gate. `isGmRewardedFilled` is a resolved `preloadAd('rewarded')`
    // (preload-supported builds) or the cooldown predictor (preload-absent), so
    // the watch-ad button only shows when an ad will actually play — fixing the
    // "tap → silent no-fill, nothing happens" the player saw when requesting
    // ads too fast.
    isRewardedReady: computed(() => isGmSdkActive.value && isGmRewardedFilled.value && !isGmAdCoolingDown.value),
    // Interstitials are auto-shown, but still gate them off during the post-ad
    // min-gap so we never pause gameplay only to fall back to a no-fill.
    isInterstitialReady: computed(() => isGmSdkActive.value && !isGmAdCoolingDown.value),
    isAdsBlocked: isGmAdsBlocked,
    init: async () => {
      try {
        await gameMonetizePlugin()
      } catch (e) {
        console.warn('[ads/gamemonetize] plugin init failed', e)
      }
    },
    showRewardedAd: () => showRewardedAdGM(),
    showMidgameAd: () => showMidgameAdGM()
  }
}
