// ─── localStorage key catalogue ─────────────────────────────────────────────
//
// Single source of truth for every player-progress key the game persists in
// localStorage. These literal strings are a contract with the player base —
// renaming any of them strands existing players' saves on the old key. Treat
// them as load-bearing constants.
//
// All keys carry the `spinner_` prefix that the SaveManager / BlobStorage
// payload allow-list recognises. Adding a new persisted key? Add it here AND
// keep the prefix.

export const STAGE_KEY = 'spinner_campaign_stage'
export const COINS_KEY = 'spinner_coins'
export const UPGRADES_KEY = 'spinner_upgrades'
