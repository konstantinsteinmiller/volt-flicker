# Sound Design TODO

Goal: add tactile, satisfying juice. Soft, layered, never disturbing — every sound under -12 dB by default, short attack & decay so they don't overlap into noise during grass-mowing bursts.

## Gameplay

- **chain-loop** — low whirring saw-chain idle, loops while `phase === 'playing'`. -24 dB.
- **grass-cut** — quick high-pitched swish/pluck (≈ 80 ms). Pitch-randomised ±2 semitones per call so a 20-blade burst feels organic, not machinegun.
- **stump-cut** — wet wood crack (≈ 220 ms).
- **boulder-cut** — sharp stone shatter with a low rumble tail (≈ 350 ms).
- **crystal-cut** — bright glass-chime shatter (≈ 400 ms).
- **obstacle-hit-blocked** — metallic clank when the chain bounces off without cutting; signals "no cut yet, buy the upgrade".
- **anchor-swap** — short mechanical kachunk on every gear swap (≈ 90 ms).
- **coin-pickup** — clean coin ding on `addCoins` (distinct from the existing `reward-continue` jingle). Pitch-laddered upward when 5+ coins arrive in quick succession (escalation).
- **splash-death** — water plop when the anchor lands over water.
- **break-down-death** — descending metallic thud when life hits 0.
- **pole-reqs-met** — subtle one-shot chime the first frame `reqsMet` flips true so the player notices the win is available.
- **pole-touch-win** — short triumphant flourish on stage-clear.
- **moving-island-creak** — very faint timber creak loop on visible moving platforms, pitched to the platform's motion period.

## UI

- **button-tap** — confirmation pop on every HUD button (`upgrade`, `+1`/`-1` chain, achievements, etc.).
- **modal-open** / **modal-close** — short whoosh in / out.
- **upgrade-buy** — ascending power-up arpeggio.
- **watch-ad-success** — same as `upgrade-buy` with a small reverb tail to differentiate.
- **hint-pop** — soft chime when the click-to-move or scroll hint fades in.
- **spotlight-stinger** — brief dramatic chord on first show of the Sharper-Saw spotlight.

## Achievements & Meta

- **achievement-unlock** — triumphant chime when a goal hits 100 %.
- **achievement-claim** — coin-shower glittery sweep on `claimAchievement`.
- **daily-claim** — same family as `achievement-claim`, slightly shorter.
- **battle-pass-tier** — escalating fanfare on tier-up.

## End-of-campaign

- **mow-a-hero** — full celebration sting (5-7 s) on the final Hall-of-Fame reward screen; layer over the existing `triggerHappytime` CG SDK call.

## Tuning notes

- Every gameplay-loop sound (grass / coin / cut) needs a hard "max concurrent voices" cap (≈ 6) plus a 20-ms minimum re-trigger interval — without it, mowing 30 blades in a swing pass becomes a wall of clicks.
- Master ducking: while `chain-loop` plays, drop battle music to -6 dB so cuts read.
- All sounds should fade-out on tab visibility-hidden so backgrounded tabs stay silent.
