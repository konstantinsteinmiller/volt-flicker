// GamePix ad provider — wraps the lazy-loaded `gamepixPlugin` in the
// cross-platform `AdProvider` surface consumed by `useAds`.
//
// **Dynamic** imports of the plugin so the plugin's heavy module — which
// contains the literal SDK URL `https://integration.gamepix.com/sdk/v3/
// gamepix.sdk.js` — only enters the bundle on builds where the GamePix
// provider is actually constructed. On a Yandex build,
// `createGamepixProvider` is never called (the env-gated arm in
// `resolveAdProvider` is dead), so the dynamic-import call sites are
// unreachable and Rollup emits no chunk for `gamepixPlugin` — keeping
// the `gamepix.com` URL out of Yandex's submitted bundle (which would
// trip the "Service storage URL detected" moderation check).
//
// This file is in `vite-plugin-javascript-obfuscator`'s exclude list, so
// the dynamic-import literal `'@/utils/gamepixPlugin'` is preserved and
// Vite resolves it correctly at runtime. Each lazy slot caches the
// resolved module so the SDK script isn't refetched per call.

import { computed, ref } from 'vue'
import type { AdProvider } from './types'

type GamepixModule = typeof import('@/utils/gamepixPlugin')
let gamepixModule: GamepixModule | null = null
const loadGamepix = async (): Promise<GamepixModule> => {
  if (!gamepixModule) gamepixModule = await import('@/utils/gamepixPlugin')
  return gamepixModule
}

// Synchronous fallback refs for the period before `init()` resolves — they
// stay at their default values on builds that never call `createGamepixProvider`.
const isReadyFallback = ref(false)
const isAdsBlockedFallback = ref(false)

export const createGamepixProvider = (): AdProvider => {
  const isReady = computed(() => gamepixModule?.isGamepixSdkActive.value ?? isReadyFallback.value)
  const isAdsBlocked = computed(() => gamepixModule?.isGamepixAdsBlocked.value ?? isAdsBlockedFallback.value)
  return {
    name: 'gamepix',
    isReady,
    // No per-format readiness query on the SDK — mirror the coarse gate.
    // No-fill bubbles up as `{ success: false }` from the show call.
    isRewardedReady: isReady,
    isInterstitialReady: isReady,
    isAdsBlocked,
    init: async () => {
      try {
        const m = await loadGamepix()
        await m.gamepixPlugin()
      } catch (e) { console.warn('[ads/gamepix] plugin init failed', e) }
    },
    showRewardedAd: async () => {
      const m = await loadGamepix()
      return m.showRewardedAdGP()
    },
    showMidgameAd: async () => {
      const m = await loadGamepix()
      // Discard the boolean — the cross-provider contract is void.
      await m.showMidgameAdGP()
    }
  }
}
