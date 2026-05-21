import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import useUser, { DEFAULT_SOUND_VOLUME, DEFAULT_MUSIC_VOLUME } from '@/use/useUser'
import {
  isSdkActive,
  onCrazyMuteChange,
  setCrazyMuted
} from '@/use/useCrazyGames'
import { isDbInitialized } from '@/use/useMatch'
import { getState, setState } from '@/use/useMawState'

const { userSoundVolume, userMusicVolume, setSettingValue } = useUser()

const isMuted = computed(() => userMusicVolume.value === 0 && userSoundVolume.value === 0)

// Persisted "the player took control" flag. CrazyGames' platform mute is
// one-way (chrome → game, no public setter), so the in-game button can never
// flip the CG chrome toggle. To make the in-game button "always win" we
// instead stop letting the platform RE-mute the player's explicit choice:
// once the player taps the button, the in-game mute state is authoritative
// and platform-mute events are ignored — now, after a reload, and across
// devices (it rides in `maw_state`). The platform mute still seeds first-time
// players who have never touched the button. Lives in `maw_state` so it
// round-trips through whichever save backend the build uses.
const MUTE_OVERRIDE_KEY = 'spinner_user_mute_overridden'
const hasUserMuteChoice = (): boolean => getState<boolean>(MUTE_OVERRIDE_KEY, false) === true
const markUserMuteChoice = (): void => setState(MUTE_OVERRIDE_KEY, true)

// Snapshot of the volumes at the moment WE muted in response to a
// platform-mute event. `null` means "no platform-mute in this session"
// — `applyMute(false)` must NOT restore from snapshot in that case.
//
// Previous version started with literal defaults (0.5 / 0.7). On a
// cold load where the SDK reported `muted=false` but the cloud-hydrated
// in-game volumes were 0/0 (user deliberately muted on a different
// device), the `else if` branch fired and overwrote the cloud's
// intentional 0/0 with the stale defaults. CG QA caught it 2026-05-05.
let muteSnapshot: { music: number; sound: number } | null = null

export const applyMute = (muted: boolean) => {
  if (muted && !isMuted.value) {
    // Platform muted, in-game wasn't — snapshot current volumes so we
    // can restore them when the platform unmutes.
    muteSnapshot = {
      music: userMusicVolume.value,
      sound: userSoundVolume.value
    }
    setSettingValue('music', 0)
    setSettingValue('sound', 0)
  } else if (!muted && isMuted.value && muteSnapshot) {
    // Platform unmuted AND we have a snapshot from an earlier platform
    // mute → restore. Without the snapshot guard this branch would also
    // fire on cold load when the user's cloud value happens to be 0/0
    // (deliberate manual mute) and the SDK reports "not muted" — we'd
    // overwrite the cloud with the snapshot's stale defaults.
    setSettingValue('music', muteSnapshot.music)
    setSettingValue('sound', muteSnapshot.sound)
    muteSnapshot = null
  }
}

/** Apply a mute that originated from the CrazyGames platform, UNLESS the
 *  player has already taken control via the in-game button — in which case
 *  the in-game state wins and the platform event is ignored. This is what
 *  keeps an in-game unmute from being re-muted by CG (now, after a reload,
 *  and across devices). Exported so the sync hook and tests share one path. */
export const applyPlatformMute = (muted: boolean) => {
  if (hasUserMuteChoice()) return
  applyMute(muted)
}

export const toggleMute = () => {
  // Tapping the button is the player taking control — from now on the in-game
  // state wins and platform-mute events no longer override it.
  markUserMuteChoice()
  const next = !isMuted.value
  if (next) {
    // Muting: snapshot the current (audible) volumes, then zero them.
    applyMute(true)
  } else if (muteSnapshot) {
    // Unmuting with a snapshot from an earlier mute → restore it.
    applyMute(false)
  } else {
    // Unmuting with NO snapshot. `applyMute(false)` is a deliberate no-op in
    // that case (it must not clobber a deliberate cloud-saved 0/0 during a
    // PASSIVE platform sync). But a USER tapping the button is an explicit
    // request for sound, so always restore audible defaults — otherwise a
    // game that booted already-muted (e.g. CrazyGames reported muted, or the
    // cloud save was 0/0) stays stuck at 0/0 and the button never unmutes.
    // This is the "FMuteButton can't unmute on CG" fix.
    setSettingValue('music', DEFAULT_MUSIC_VOLUME)
    setSettingValue('sound', DEFAULT_SOUND_VOLUME)
  }
  setCrazyMuted(next)
}

export { isMuted }

/**
 * Call once at the App level to keep the CrazyGames platform mute toggle
 * in sync with the in-game volume for the entire session, regardless of
 * which components are mounted.
 *
 * Direction of truth: the CG SDK is the source of truth for the mute
 * state — there's no public setter, the platform chrome owns it. We
 * listen for `sdk.game.addSettingsChangeListener` events (the v3
 * canonical API — the legacy `addMuteListener` never fires on the real
 * SDK) via `onCrazyMuteChange`, which also replays the current state to
 * the subscriber on attach, so one hook covers both the initial sync
 * and every subsequent toggle.
 *
 * We gate the *initial* apply on `isDbInitialized`: if IndexedDB hasn't
 * hydrated saved volume settings yet, we stash the pending mute and
 * apply it once hydration finishes so we don't fight the loader. Later
 * toggles flow through immediately.
 */
export const useCrazyMuteSync = () => {
  let unsubscribe: (() => void) | null = null
  const pendingInitialMute = ref<boolean | null>(null)

  const handleSdkMute = (muted: boolean) => {
    if (!isDbInitialized.value) {
      pendingInitialMute.value = muted
      return
    }
    // `applyPlatformMute` ignores the event if the player has taken control —
    // so an in-game unmute is never re-muted by the platform.
    applyPlatformMute(muted)
  }

  const stopDbWatch = watch(isDbInitialized, (ready) => {
    if (!ready || pendingInitialMute.value === null) return
    applyPlatformMute(pendingInitialMute.value)
    pendingInitialMute.value = null
  })

  onMounted(() => {
    if (!isSdkActive.value) return
    unsubscribe = onCrazyMuteChange(handleSdkMute)
  })

  onUnmounted(() => {
    unsubscribe?.()
    unsubscribe = null
    stopDbWatch()
  })
}
