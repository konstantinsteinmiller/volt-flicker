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
// Best tiles travelled in ENDLESS mode (separate from the campaign best score).
export const BEST_ENDLESS_KEY = 'epic_best_endless'
// First-run onboarding assist consumed flag (true once the first run finishes).
export const ONBOARDED_KEY = 'epic_onboarded'
// Daily missions: { day: 'YYYY-MM-DD', missions: Mission[] } (regen per day).
export const MISSIONS_KEY = 'epic_missions'
// First-run-of-day 2× bonus bookkeeping: the local day it was last consumed.
export const DAILY_BONUS_DAY_KEY = 'epic_daily_bonus_day'
// One-time "you can afford an upgrade" spotlight on the Upgrades button (#16).
export const UPGRADE_SPOTLIGHT_KEY = 'epic_upgrade_spotlight_seen'
