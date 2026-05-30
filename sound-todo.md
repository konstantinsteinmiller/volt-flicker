# Sound TODO — Epicancer

Audit of in-game moments vs. the SFX actually triggered in code
(`grep playSound|playRandomVariant` across `src/`). The project already ships a
large `.ogg` library, so most gaps can be filled by *wiring an existing file*
rather than recording a new one.

> Note: this file previously held the legacy *spin&mow* sound design notes
> (chain-loop / grass-cut / mow-a-hero). Those were obsolete for Epicancer and
> were replaced by this audit — recover them from git history if still needed.

## ✅ Already covered (for reference)

| Moment | File |
| --- | --- |
| Flip roll direction | `anchor-swap` |
| Coin pickup (throttled 150ms) | `coin-pickup` |
| Item-box pickup | `level-up` |
| Enter vortex / portal | `gravity` |
| Push-destroy a small obstacle | `barricade` |
| Spend Second Chance | `barricade` |
| Crash death | `plastic-torn-1/2` (random) |
| Hole death | `celebration-1` |
| Stage clear / win | `celebration-2` + `happy` + `celebration-3` |
| Upgrade buy | `level-up` |
| Upgrade sell-back | `coin-pickup` |
| Modal open | `modal-open` |

## 🔧 Wired this pass (files existed, events were silent)

| Moment | File now used |
| --- | --- |
| Auto-dodge (Dodge Apprentice / Dodge power-up swing) | `dodge` *(the file you just added)* |
| Destroy an obstacle while **Invincible** | `barricade` |
| Roll through a box with **Rolling Boulder** | `barricade` |
| Game-Over / lose result screen | `lose` |

## ❗ Still essential — recommend a NEW recording

| # | Moment | Trigger point | Why it matters | Suggested character |
| --- | --- | --- | --- | --- |
| 1 | **Run start** | `begin()` (tap / space / enter from idle) | The very first interaction has no audio feedback — feels dead on launch. | Short upbeat "whoosh / go" (~250ms) |
| 2 | **Power-up pickups are generic** | `grantItem()` → every timed power-up reuses `level-up` | Invincible / Magnet / Dodge / Slow-mo / Push are indistinguishable by ear. | One distinct sting per power-up type (5 short clips) |
| 3 | **Liberty Cat hazard** | enter / pre-collide a `libertyCat` cell (stage 10+) | The signature late-game obstacle dies with the same `plastic-torn` as any crash. | A unique "cat" death sting for flavour |
| 4 | **Rolling Boulder roll-through** | box passed via the Rolling Boulder upgrade | Reuses `barricade`; a heavy stone *rumble* would sell the fantasy better. | Low rolling-rumble (~400ms) |
| 5 | **Coins banked on result screen** | `grantRunCoins()` coin-explosion fly-in | Only `happy` from the explosion; a dedicated cash-register/tally would punch harder. | Rising coin-tally shimmer |

## 🎚️ Polish / optional

- **Speed-up cue**: the within-stage acceleration ramp is silent — a subtle
  rising tone as the ball nears the goal would telegraph the danger.
- **Near-miss / dodge "whiff"**: a faint whoosh when the ball squeaks past a
  hazard without the dodge upgrade.
- **Second Chance armed at run start**: a one-time "ready" chime when a
  pre-bought Second Chance spawns the angel wings.

Priorities 1–2 are the most noticeable to a new player; everything below is flavour.
