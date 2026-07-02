# volt-flicker 3 Dev Pipeline — Prism Shift

How this game is built, run, verified, and packaged **without manually using the volt-flicker editor**.
This is the knowledge base: read it before touching the build. Everything lives under `.c3-build/`.

---

## 0. TL;DR — the daily loop

```
edit .c3-build/run/prism/*.js          # the game (framework-agnostic ES modules)
node .c3-build/serve.mjs &             # serve on http://localhost:8347  (once; leave running)
open http://localhost:8347/run/        # the standalone HARNESS — drive/verify in a browser
# ...iterate against the harness (screenshot, inject keys, read window.__prism.snapshot())...
node .c3-build/bundle.mjs              # concat modules -> run/prism-bundle.js
node .c3-build/gen-prism-c3p.mjs .     # wrap bundle -> PrismShift.c3p   (the volt-flicker project)
```
The user opens `PrismShift.c3p` in volt-flicker → **Preview** to play, **Export → HTML5** for the jam.

---

## 1. Why this architecture (the core insight)

volt-flicker 3 is a no-code web IDE that can't be driven reliably by automation (canvas editor, OS file
dialogs, popup-based preview). And its **Free Edition caps ~50 events / 2 layers**, which the game's
scope blows past.

**So: the game is plain JavaScript, and volt-flicker is only the shell.**
- **Logic in JS** (volt-flicker *scripting*) — JS does **not** count toward the 50-event cap, gives true
  `vw/vh` responsiveness, and makes levels pure data.
- The whole game is a **self-contained Canvas2D engine** that renders to its own full-bleed `<canvas>`.
  volt-flicker hosts it via one `runOnStartup` script and provides loading + **HTML5 export** for the jam.
- We **develop in a standalone localhost harness** (a plain `index.html` + the engine), which is fully
  drivable by the Chrome-DevTools MCP — *far* more reliable than volt-flicker's editor/preview — then
  **bundle the identical code into the `.c3p`**.

This satisfies "made with volt-flicker 3" (it's a real C3 project, exported by C3) while keeping the build
tractable and verifiable.

---

## 2. Environment facts (verified, r487)

- User's volt-flicker = **editor.volt-flicker.net as a window in their main Brave** (NOT a native app).
  **Never quit/relaunch their Brave** (90+ tabs incl. the CrazyGames × volt-flicker jam Discord).
- Editor loads fully as **"Gast" (Guest) — no login needed** to edit/load. UI is German;
  **ACE ids are language-independent**.
- **Event limits:** Guest = **25 events**, registered+verified email = **50**. (Irrelevant here — JS-first.)
- JS scripting, `DrawingCanvas`, `HTMLElement`, `Platform`, `Solid` all **allowed on Free/Guest** (M0).
- `savedWithRelease: 48703` (r487). The `.c3p` is a **ZIP (STORE method, forward-slash paths)**.

### `.c3p` format gotchas (from a real r487 export)
- SDK-v2 **behavior ids are lowercased**: `solid`, `scrollto` (NOT `Solid`/`ScrollTo`); `Platform` keeps
  its capital. The v1 `8Direction` is **dropped in r487** — don't use it.
- Instance `world` uses `"z"`, **not** `"zElevation"`.
- Instance `behaviors` keyed by **display-name** → `{properties:{…}}`; `objectType.behaviorTypes` maps
  that name → `behaviorId`.
- Layers **and** layouts carry `"sampling":"auto"`.
- Image filenames are **fully lowercased**, incl. animation name: `player-animation 1-000.png`.
- IDs: SID = 15-digit random; UID = sequential from 0; imageSpriteId = 7-digit random.
- Script files: `scripts/<name>.js`, listed in `rootFileFolders.script.items` with
  `"file-info":{"purpose":"none"}`, project `properties.scriptsType:"module"`. Entry runs via the global
  **`runOnStartup(async runtime => …)`** (works on Free; confirmed loadable).
- A **script-only project is valid**: `usedAddons: []`, `objectTypes: { items: [] }`, one empty layout.

Reference repo cloned for format ground-truth: `github.com/liauw-media/volt-flicker3-mcp`
(`templates.ts`/`png-generator.ts` encode the schema — but target r449; **trust a real r487 export over
it** where they differ).

---

## 3. Files under `.c3-build/`

| File | Role |
| --- | --- |
| `serve.mjs` | Dual-stack (127.0.0.1 **and** ::1) CORS static server on **:8347**, content-type aware. Serves `.c3-build/` (so `/run/…` and `/PrismShift.c3p`). |
| `run/index.html` | The **harness** — loads `prism/game.js` as a module onto a full-screen canvas. |
| `run/prism/*.js` | The game engine (ES modules): `core, world, player, beams, juice, render, tuning, levels, ui, audio, game`. |
| `run/c3-entry.js` | Boots the engine onto a created canvas; uses `runOnStartup` if present (C3), else `DOMContentLoaded` (harness). |
| `run/prism-bundle.js` | **Generated** single-file bundle (no imports) — the C3 script. |
| `run/bundle-test.html` | Loads `prism-bundle.js` as a classic script to verify the bundle runs. |
| `bundle.mjs` | Concatenates modules (strips `import`/`export`, wraps in an IIFE) → `run/prism-bundle.js`. |
| `gen-prism-c3p.mjs` | Wraps the bundle as `scripts/prism.js` in a script-only **`PrismShift.c3p`**. |
| `gen-prism-m0.mjs` | (M0) scaffold generator — Player/Wall/DrawingCanvas/HTMLElement probe. |
| `gen2.mjs` | (earlier) PlatformTest generator — the format-validation platformer. |

The engine never imports volt-flicker APIs, so the **same code runs in the harness and inside C3**.

---

## 4. The automation rig (how a `.c3p` is loaded into volt-flicker headlessly)

Used to **verify a `.c3p` loads** in the real editor (not needed for daily dev — that's the harness).

1. **Chrome-DevTools MCP** drives its own browser (separate from the user's Brave). Navigate to
   `https://editor.volt-flicker.net/`.
2. volt-flicker opens projects via the **File System Access API** (`showOpenFilePicker`) — there is **no
   `<input type=file>`**, so `upload_file` does NOT work.
3. **Override the picker in-page** so it returns a `File` fetched from the local server:
   ```js
   window.showOpenFilePicker = async () => {
     const r = await fetch('http://localhost:8347/' + window.__c3pFileName, { cache: 'no-store' });
     const file = new File([await r.arrayBuffer()], window.__c3pFileName);
     return [{ kind:'file', name:window.__c3pFileName, getFile: async()=>file,
       queryPermission: async()=>'granted', requestPermission: async()=>'granted',
       isSameEntry: async()=>false, createWritable: async()=>{throw new Error('ro')} }];
   };
   ```
   Install it via `navigate_page` **`initScript`** on reload (runs before C3) — robust.
4. **CSP critical detail:** the editor's `connect-src` allows `http://localhost:*` and `https://localhost:*`
   but **NOT `127.0.0.1`** (matched literally). So the server **must be reachable via hostname
   `localhost`**, and must bind **both** `127.0.0.1` and `::1` (localhost resolves to either).
   No byte-embedding needed.
5. Drive the UI: dismiss the welcome dialog (link text "Nein danke, nicht jetzt"), click **ÖFFNEN**
   then **DATEI** (snapshot → `click` by uid). volt-flicker calls the override → opens the project.
6. Verify via screenshot + `list_console_messages` (ignore `[LANG] Failed to find 'de-DE'` warnings —
   they're volt-flicker's own i18n gaps). A clean tree (script present, no "missing addons" dialog) = pass.

### MCP gotchas
- `upload_file` is **sandboxed to the workspace root** → keep `.c3p` under the repo (`.c3-build/`),
  not Downloads/temp.
- volt-flicker **Preview** opens `https://preview.volt-flicker.net/local.html` via `window.open`; the MCP
  doesn't reliably attach to that popup and the MCP browser is headless — **don't rely on Preview for
  verification**. Use the harness instead.
- The preview button is a `<div title="Vorschau …">` not in the a11y tree; set `role=button` + `tabindex`
  on it if you ever need a trusted MCP `click`.

---

## 5. The harness dev loop (primary)

`http://localhost:8347/run/` runs the engine as an MCP-tracked page. Verification tools:
- **Screenshot** — visual check (renders identically to the C3 build).
- **`window.__prism.snapshot()`** — live state: level, player {x,y,vx,vy,isSolid,onGround,alive},
  core charges, shards, dead/won, time.
- **Inject input** — `dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}))` etc. (the engine
  listens to real DOM key events; isTrusted doesn't matter for our own listeners).
- **`window.__prism`** also exposes `loadLevel(i)`, `die()`, `win()`, `engine.paused`, `engine.stop()/start()`.

### Verification gotchas
- **rAF throttles** when the MCP page is backgrounded (game time advances slowly). For multi-second
  input-driven tests, either wait long real-time or **drive state directly** (pin the player, call
  `beams.update`, read charge) for deterministic checks.
- The game auto-runs during tool latency (seconds pass between calls). To inspect a frozen frame:
  `engine.stop()`, screenshot, then `engine.start()`.
- Level geometry solvability check (no play needed): for each level, sweep a Phase player up the beam
  and confirm `beams.update(world, player,{refraction:true}).chargingCores.size > 0`.

---

## 6. Bundling + packaging into volt-flicker

- **`bundle.mjs`** reads the modules in dependency order, strips single-line `import`/`export`, wraps in
  an IIFE → `run/prism-bundle.js`. (Works because module symbols are uniquely named.) Always
  `node --check run/prism-bundle.js` after.
- Verify the bundle runs: load `run/bundle-test.html` (classic `<script src=prism-bundle.js>`),
  check `window.__prism` booted.
- **`gen-prism-c3p.mjs`** embeds the bundle as `scripts/prism.js` in a **script-only** `PrismShift.c3p`
  (empty `usedAddons`/`objectTypes`, one empty `Game` layout, `scriptsType:"module"`, `runOnStartup`
  boots the engine on a `position:fixed; inset:0; z-index:5` canvas over C3's shell).
- The `.c3p` is copied to `~/Downloads/` for the user. They **Preview** to play, **Export → HTML5** to ship.

Rebuild after any engine change:
```
node bundle.mjs && node --check run/prism-bundle.js && node gen-prism-c3p.mjs .
```

---

---

## 8. Hard-won lessons (don't relearn these)

1. CSP allows `localhost:*` but not `127.0.0.1` — serve on the hostname, bind both loopback stacks.
2. volt-flicker uses `showOpenFilePicker` (File System Access), not a file input — override it, don't upload.
3. r487 dropped SDK-v1 behaviors; match a **real export's** ids/casing, not old docs/repos.
4. Free Edition's event/layer caps ⇒ go **JS-first**; events stay ~0.
5. Don't fight volt-flicker Preview in automation — **bundle + harness** is the reliable loop.
6. `bundle.mjs` keeps the dev experience modular while shipping one C3 script (no toolchain needed; no
   esbuild in this repo).
7. Kill stale servers by PID/port before restarting (EADDRINUSE); in Git-Bash-invoked PowerShell,
   avoid `$_` (Bash expands it) — pass single-quoted PS or explicit PIDs.
8. The engine reads DOM key/pointer events directly (no volt-flicker input plugin), so input works
   identically in harness and C3.

---

## 9. Related docs
- `game-design-overpowered.md` — the GDD.
- Agent memory: `volt-flicker3-c3p-generation`, `volt-flicker3-automation-rig`, `prism-shift-project`.
