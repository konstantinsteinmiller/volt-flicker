// ─── Game-progress field catalogue ──────────────────────────────────────────
//
// Field names INSIDE the single `epicancer_state` blob (see `useEpicState.ts`).
// These are not separate localStorage keys — they're properties of the one
// persisted object — but they're still a contract with the player base:
// renaming any of them strands existing players' progress on the old field.
// Treat them as load-bearing constants.

export const STAGE_KEY = 'epic_stage'
export const COINS_KEY = 'epic_coins'
export const UPGRADES_KEY = 'epic_upgrades'
export const BEST_SCORE_KEY = 'epic_best_score'
