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
// Pre-bought "Second Chance": a sticky flag that arms the player to start every
// run with angel wings + the second-chance shield until one is consumed.
export const START_SECOND_CHANCE_KEY = 'epic_start_second_chance'
// Cosmetic ball skins: { owned: string[], selected: string }. Owned IDs are
// purchased with coins; `selected` is the equipped skin rendered on the ball.
export const SKINS_KEY = 'epic_skins'
