// GamePix ad provider — wraps the lazy-loaded `gamepixPlugin` in the
// cross-platform `AdProvider` surface consumed by `useAds`.
//
// **Static** imports of the plugin, not dynamic — the obfuscator's
// `stringArray` transform mangles `'@/...'` literals inside dynamic
// imports, leaving the browser with a bare specifier it can't
// resolve (`Failed to resolve module specifier '@/utils/gamepixPlugin'`).
// `main.ts`'s lazy-import dispatch is what actually keeps the plugin
// off non-GamePix builds — Rollup tree-shakes the entire provider →
// plugin chain when `import.meta.env.VITE_APP_GAMEPIX === 'false'`.

import { computed } from 'vue'
import {
  gamepixPlugin,
  isGamepixAdsBlocked,
  isGamepixSdkActive,
  showMidgameAdGP,
  showRewardedAdGP
} from '@/utils/gamepixPlugin'
import type { AdProvider } from './types'

export const createGamepixProvider = (): AdProvider => {
  const isReady = computed(() => isGamepixSdkActive.value)
  return {
    name: 'gamepix',
    isReady,
    // No per-format readiness query on the SDK — mirror the coarse gate.
    // No-fill bubbles up as `{ success: false }` from the show call.
    isRewardedReady: isReady,
    isInterstitialReady: isReady,
    isAdsBlocked: isGamepixAdsBlocked,
    init: async () => {
      try { await gamepixPlugin() }
      catch (e) { console.warn('[ads/gamepix] plugin init failed', e) }
    },
    showRewardedAd: () => showRewardedAdGP(),
    showMidgameAd: async () => {
      // Discard the boolean — the cross-provider contract is void.
      await showMidgameAdGP()
    }
  }
}
