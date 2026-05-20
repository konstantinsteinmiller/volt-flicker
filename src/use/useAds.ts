// Single entry point for ad placements. Picks a provider at module load
// time based on build flags and re-exports a stable surface
// (`isAdsReady`, `showRewardedAd`, `showMidgameAd`, `initAds`) that the
// four in-game ad placements bind to without caring which backend is
// live.
//
// Provider selection:
//   • `isCrazyWeb` build        → CrazyGames SDK (gate also requires
//                                  `isCrazyGamesFullRelease` inside the
//                                  provider)
//   • `isGameDistribution` build → GameDistribution.com SDK
//   • `showMediatorAds && isNative` → Unity LevelPlay (Tauri plugin)
//   • everything else           → Noop (ads UI hidden, calls inert)
//
// The CrazyGames SDK is still initialised directly from `main.ts` — it
// has to run before the SaveManager hydrates. LevelPlay and GameDistribution
// init happen after mount via `initAds()` — LevelPlay because the native
// side needs the Android Activity / iOS ViewController to be alive,
// GameDistribution because the SDK script is dynamically injected and we
// don't want to pay that latency on the boot critical path.
import { computed, ref } from 'vue'
import { isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution, isPlaygama, isGamepix, isNative, showMediatorAds } from '@/use/useUser'
import type { AdProvider } from './ads/types'
import { resolveAdProvider } from '@/platforms/resolveAdProvider'
import { isRewardedThrottled, recordRewardedGranted } from '@/use/useRewardedThrottle'
import { isAdShowing, isGamePaused } from '@/use/useGamePause'
import { installGamePauseAudio } from '@/use/useGamePauseAudio'
import { __audioDebugSnapshot } from '@/use/useAssets'
import { isDebug } from '@/use/useMatch'

const provider: AdProvider = resolveAdProvider({
  flags: { isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution, isPlaygama, isGamepix },
  showMediatorAds,
  isNative
})

// Wire the universal pause gate → audio-suspend orchestrator at module
// load. `useAds` is imported by `main.ts` on every build, so this guarantees
// the audio mute is armed before any ad can show — even if `main.ts`'s
// explicit install is ever reordered. Idempotent: the orchestrator installs
// a single subscriber no matter how many callers invoke it.
installGamePauseAudio()

const TAG = '[ads]'

/** Debug-gated info log for the ad lifecycle (START/END). Fires on every ad,
 *  so gate it behind `isDebug` (set via the `cmarc` cheat or
 *  `localStorage.setItem('debug','true')`). The ERROR `console.warn`s on the
 *  cut-off path stay unconditional. */
const dlog = (...args: unknown[]): void => {
  if (isDebug.value) console.info(...args)
}

export const adProviderName = provider.name
// `isAdsReady` is the coarse "SDK initialised" gate. Most placements
// should NOT bind directly to it — they want a per-format readiness
// flag that flips false when no ad is currently loaded, so the UI
// disappears instead of offering a button that does nothing on tap.
export const isAdsReady = computed(() => provider.isReady.value)
// Throttle ride-along: when the player has already watched
// `MAX_REWARDED` rewarded videos in the trailing 10-min window, we
// flip `isRewardedReady` false so every reward placement
// (RouletteWheel respin, AdRewardButton, 2x speed boost) hides — the
// same UX as a no-fill SDK state. Anti-abuse for kids audience: caps
// the watch-only reward farming pattern.
export const isRewardedReady = computed(() =>
  provider.isRewardedReady.value && !isRewardedThrottled.value
)
export const isInterstitialReady = computed(() => provider.isInterstitialReady.value)
/** True once the active ad provider has detected a browser-extension
 *  ad-blocker (uBlock, AdGuard, Brave Shields, etc.). Drives the
 *  shared `AdsBlockedModal`. Always false on native builds. */
export const isAdsBlocked = computed(() => provider.isAdsBlocked.value)

/**
 * Toggled true by `showRewardedAd()` when the rewarded show resolved
 * `false` AND the active provider has detected an ad-blocker. The
 * `AdsBlockedModal` v-if's on this flag and exposes a dismiss action
 * via `dismissAdsBlockedModal()`.
 *
 * Only the REWARDED path triggers the modal — interstitial / midgame
 * ads aren't user-initiated, so a missed one shouldn't surface a
 * blocking explainer mid-game. The blocker flag itself still flips
 * true via that path so the modal will fire on the player's next
 * watch-ad tap.
 */
export const isAdsBlockedModalShown = ref(false)
export const dismissAdsBlockedModal = (): void => {
  isAdsBlockedModalShown.value = false
}

export const initAds = (): Promise<void> => provider.init()

export const showRewardedAd = async (): Promise<boolean> => {
  // Throttle gate: refuse the SDK call once the player has burned
  // their 10-min budget. Returning `false` here matches the
  // contract callers already handle (no grant). The reward UI is
  // already hidden via `isRewardedReady`, so this branch only fires
  // if a placement somehow bypassed that check.
  if (isRewardedThrottled.value) return false
  // Flip `isAdShowing` BEFORE the await. It OR's into `isGamePaused`,
  // which the audio orchestrator (`useGamePauseAudio`) watches with
  // `flush: 'sync'` — so the renderer pause AND the audio suspend both
  // fire inside THIS call stack, before the SDK call yields. GamePix's
  // rewarded ad opens its overlay synchronously and never fires the
  // platform pause callback for rewarded placements, so this flip is the
  // only signal that mutes audio + physics underneath the ad.
  dlog(`${TAG} ▶ rewarded START (provider=${provider.name})`)
  isAdShowing.value = true
  try {
    const granted = await provider.showRewardedAd()
    if (granted) {
      recordRewardedGranted()
    } else if (provider.isAdsBlocked.value) {
      isAdsBlockedModalShown.value = true
    }
    dlog(`${TAG} ⏹ rewarded END (provider=${provider.name}, granted=${granted})`)
    return granted
  } catch (e) {
    // Defensive: provider contract is not to reject, but if a backend
    // throws (SDK error, network) we still drop the pause gate so audio +
    // gameplay resume — the "cut off due to error" case QA called out.
    console.warn(`${TAG} ✖ rewarded ERROR (provider=${provider.name}) — resuming`, e)
    return false
  } finally {
    // Dropping `isAdShowing` clears the gate (assuming no other reason is
    // active) → orchestrator resumes audio synchronously, render loop
    // restarts. Runs on success, no-fill, AND the throw path above.
    isAdShowing.value = false
  }
}

export const showMidgameAd = async (): Promise<void> => {
  dlog(`${TAG} ▶ interstitial START (provider=${provider.name})`)
  isAdShowing.value = true
  try {
    await provider.showMidgameAd()
    dlog(`${TAG} ⏹ interstitial END (provider=${provider.name})`)
  } catch (e) {
    // Same "cut off due to error" safety net as the rewarded path: never
    // leave the game muted/paused if the interstitial backend throws.
    console.warn(`${TAG} ✖ interstitial ERROR (provider=${provider.name}) — resuming`, e)
  } finally {
    isAdShowing.value = false
  }
}

// ⚠️ TEMP TEST HARNESS (remove before commit) ──────────────────────────────
// Deterministic verification of the universal pause+mute gate WITHOUT a live
// ad SDK. From the browser console / Chrome DevTools MCP, with a battle
// running and music playing:
//     window.__audioDebug()             // snapshot before  → audioCtxState:'running'
//     await window.__testInterstitial() // holds the gate for 5s
//     window.__audioDebug()             // snapshot during  → suspended + paused
// During the hold: `isGamePaused` is true (render loop early-returns in
// MawScene) and the AudioContext is suspended + every tracked HTMLAudio is
// paused (no music, no SFX). This mirrors EXACTLY what `showMidgameAd` does
// around a real interstitial — only the provider/SDK call is replaced by a
// timer, so it isolates the gate from SDK promise-timing quirks.
// Gated on `import.meta.env.DEV`, so it is dead-code-eliminated from every
// production/platform build.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>
  w.__testInterstitial = async (ms = 5000): Promise<void> => {
    console.info(`${TAG} [TEST] ▶ fake interstitial START — holding gate ${ms}ms`)
    isAdShowing.value = true
    try {
      await new Promise((resolve) => setTimeout(resolve, ms))
    } finally {
      isAdShowing.value = false
      console.info(`${TAG} [TEST] ⏹ fake interstitial END — gate released`)
    }
  }
  w.__audioDebug = () => {
    const snap = {
      isGamePaused: isGamePaused.value,
      isAdShowing: isAdShowing.value,
      ...__audioDebugSnapshot()
    }
    console.info(`${TAG} [TEST] audio snapshot`, snap)
    return snap
  }
}

const useAds = () => ({
  adProviderName,
  isAdsReady,
  isRewardedReady,
  isInterstitialReady,
  initAds,
  showRewardedAd,
  showMidgameAd
})

export default useAds
