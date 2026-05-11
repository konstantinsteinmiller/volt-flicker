import { fileURLToPath, URL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

import { defineConfig, loadEnv, type Plugin } from 'vite'

// ─── Campaign-overrides on-disk persistence ────────────────────────────
// The level editor writes back into `data/campaign-overrides.json` so the
// stages live in the repo (committable, fine-tunable in source) rather
// than only in the user's localStorage. Two surfaces:
//   1. A virtual module `virtual:campaign-overrides` that ships the
//      current JSON as the campaign's seed override map. Resolved at
//      both dev and build time.
//   2. Dev-only middleware:
//        POST /__maw/save-override   { id, stage }   → writes to disk
//        POST /__maw/clear-override  { id }          → removes from disk
//      Production builds don't expose these — the editor button silently
//      falls back to localStorage when the endpoint is absent.
const OVERRIDES_FILE = resolve(
  fileURLToPath(new URL('./data/campaign-overrides.json', import.meta.url))
)
const OVERRIDES_VIRTUAL_ID = 'virtual:campaign-overrides'
const OVERRIDES_RESOLVED = '\0' + OVERRIDES_VIRTUAL_ID

const ensureOverridesFile = () => {
  if (!existsSync(OVERRIDES_FILE)) {
    mkdirSync(dirname(OVERRIDES_FILE), { recursive: true })
    writeFileSync(OVERRIDES_FILE, '{}\n', 'utf-8')
  }
}

const readOverridesJson = (): Record<string, unknown> => {
  ensureOverridesFile()
  try {
    const parsed = JSON.parse(readFileSync(OVERRIDES_FILE, 'utf-8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

const writeOverridesJson = (data: Record<string, unknown>) => {
  ensureOverridesFile()
  writeFileSync(OVERRIDES_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

const readBody = (req: import('node:http').IncomingMessage): Promise<string> =>
  new Promise((res, rej) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => res(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', rej)
  })

const mawCampaignOverridesPlugin = (): Plugin => ({
  name: 'maw-campaign-overrides',
  resolveId(id) {
    if (id === OVERRIDES_VIRTUAL_ID) return OVERRIDES_RESOLVED
    return null
  },
  load(id) {
    if (id !== OVERRIDES_RESOLVED) return null
    return `export default ${JSON.stringify(readOverridesJson())}`
  },
  configureServer(server) {
    // Hot-reload the virtual module if the JSON file is edited by hand.
    server.watcher.add(OVERRIDES_FILE)
    server.watcher.on('change', (path) => {
      if (resolve(path) !== OVERRIDES_FILE) return
      const mod = server.moduleGraph.getModuleById(OVERRIDES_RESOLVED)
      if (mod) server.moduleGraph.invalidateModule(mod)
      server.ws.send({ type: 'full-reload', path: '*' })
    })

    server.middlewares.use('/__maw/save-override', async (req, res, next) => {
      if (req.method !== 'POST') { next(); return }
      try {
        const body = JSON.parse(await readBody(req)) as { id?: number; stage?: unknown }
        if (typeof body.id !== 'number' || !body.stage) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'expected { id: number, stage }' }))
          return
        }
        const data = readOverridesJson()
        data[String(body.id)] = body.stage
        writeOverridesJson(data)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, id: body.id }))
      } catch (e) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: String((e as Error).message) }))
      }
    })

    server.middlewares.use('/__maw/clear-override', async (req, res, next) => {
      if (req.method !== 'POST') { next(); return }
      try {
        const body = JSON.parse(await readBody(req)) as { id?: number }
        if (typeof body.id !== 'number') {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'expected { id: number }' }))
          return
        }
        const data = readOverridesJson()
        delete data[String(body.id)]
        writeOverridesJson(data)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, id: body.id }))
      } catch (e) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: String((e as Error).message) }))
      }
    })
  }
})

// Read the package version directly so APP_VERSION resolves regardless of
// how vite is invoked. `process.env.npm_package_version` is only set when
// vite runs via `pnpm run <script>` — running `pnpm vite` directly leaves
// it undefined, which makes Vite log the literal define entry as a warning.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
) as { version?: string }
const appVersion: string = pkg.version ?? '0.0.0'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import javascriptObfuscator from 'vite-plugin-javascript-obfuscator'
import { buildCsp } from './src/platforms/csp'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  // Load env file based on `mode` in the current working directory.
  // The third parameter '' loads all env vars regardless of VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '')

  // Only obfuscate during a real production build — never during dev,
  // where the obfuscator rewrites dynamic import strings into lookups
  // Vite can no longer transform, breaking module specifiers at runtime.
  const isProduction = (mode === 'production' || env.VITE_NODE_ENV === 'production') && command === 'build'
  const shouldObfuscate = env.VITE_ENABLE_OBFUSCATION === 'true'

  // Initialize plugins array
  const plugins = []

  // Campaign-overrides plugin — virtual module + dev write endpoints so
  // editor saves persist to `data/campaign-overrides.json` in the repo.
  plugins.push(mawCampaignOverridesPlugin())

  // Only push the obfuscator if both conditions are met
  if (isProduction && shouldObfuscate) {
    console.log('--- 🛡️  Obfuscating Production Build ---')
    plugins.push(
      javascriptObfuscator({
        // Exclude files with dynamic imports — the obfuscator's stringArray
        // rewrites import paths into array lookups that Vite can no longer
        // resolve, which breaks code splitting.
        exclude: [
          /router\/index\.ts$/,
          /main\.ts$/,
          // i18n loader uses `import.meta.glob` for per-locale code
          // splitting — the obfuscator's stringArray rewrites those
          // dynamic paths so rollup can no longer produce separate
          // chunks (every locale ends up inlined in index.js).
          /i18n[\\/]index\.ts$/,
          // resolveSaveStrategy uses `await import('@/...')` inside
          // `import.meta.env.VITE_APP_*`-gated branches so Rollup can
          // tree-shake unused platform plugins. Obfuscation would
          // mangle the dynamic-import literals and break runtime
          // module resolution. (resolveAdProvider stays static-import
          // sync, so it doesn't need an exclude.)
          /platforms[\\/]resolveSaveStrategy\.ts$/,
          // GameDistributionProvider lazy-loads the heavy
          // `@/utils/gameDistributionPlugin` (~500 LOC) via dynamic
          // import so non-GD builds don't ship the GD SDK code.
          // Same obfuscator-vs-dynamic-import constraint as above.
          /use[\\/]ads[\\/]GameDistributionProvider\.ts$/,
          // useMawCampaign lazy-loads the heavy `useStageBuilder`
          // chunk via `await import('@/use/useStageBuilder')` so all
          // 20 stage builds stay off the boot critical path. The
          // obfuscator's stringArray rewrite would inline the chunk
          // back into the parent, undoing the split.
          /use[\\/]useMawCampaign\.ts$/,
          // useAssets.preloadAssets dynamic-imports the campaign module
          // so the gameplay shared-chunk loads in parallel with the
          // splash render instead of blocking the entry parse. Same
          // obfuscator-vs-dynamic-import constraint as above.
          /use[\\/]useAssets\.ts$/
        ],
        // ─── Obfuscation profile (tuned 2026-04-30) ─────────────────────
        // The previous profile enabled every aggressive transform the
        // plugin offers — `controlFlowFlattening`, `numbersToExpressions`,
        // `splitStrings`, `unicodeEscapeSequence`. Combined they were
        // inflating the bundle by ~3.4× over the unobfuscated baseline
        // (e.g. 217KB → 768KB on the entry chunk for the CrazyGames
        // build flagged by CG QA on 2026-04-30).
        //
        // The transforms removed below all have the same trade-off:
        // huge bundle / runtime cost for protection that any
        // off-the-shelf deobfuscator strips in seconds. Keeping them on
        // costs real users real download time without preventing a
        // motivated reverse-engineer for more than a coffee break.
        //
        // What stays (cheap, useful):
        //   • compact            — single-line output
        //   • simplify           — CFG simplification
        //   • stringArray        — string indirection table
        //   • stringArrayThreshold 0.6 — moderate coverage
        //
        // What was removed (expensive, low-value):
        //   • unicodeEscapeSequence — every `"foo"` → `"foo"`
        //     ~doubles strings on the wire. Trivially reversed.
        //   • splitStrings          — splits every string into 2-char
        //     pieces concatenated at runtime. Triples string size,
        //     interpretable by any human in <1 minute.
        //   • controlFlowFlattening — wraps every block in a switch
        //     dispatcher. ~30% bundle inflation, ~10% runtime perf hit.
        //   • numbersToExpressions  — every literal `5` becomes
        //     `0x4 + 0x1` etc. Bloats math-heavy modules (the canvas
        //     game loop is full of these).
        //
        // If a tighter profile is needed later, prefer enabling
        // `controlFlowFlattening` selectively on a small allowlist of
        // sensitive files (anti-cheat hot paths, license checks) rather
        // than blanket-enabling everywhere.
        options: {
          compact: true,
          simplify: true,
          stringArray: true,
          stringArrayThreshold: 0.6
        }
      } as any)
    )
  }

  // ─── CSP generation ────────────────────────────────────────────────
  // The whole per-platform CSP shape lives in `src/platforms/csp.ts`
  // — extracted so it's unit-testable. Adding a new platform's CSP
  // contribution = edit that file, not this one.
  const cspValue = buildCsp(env)

  plugins.push({
    name: 'inject-csp',
    transformIndexHtml(html: string) {
      return html.replace(
        '<!-- CSP meta tag injected by vite.config.ts at build time -->',
        `<meta http-equiv="Content-Security-Policy" content="${cspValue}" />`
      )
    }
  })

  // Strip the CrazyGames SDK <script> tag from index.html for non-CrazyGames builds
  // so it doesn't block or error on other platforms (e.g. Wavedash).
  const isCrazyWeb = env.VITE_APP_CRAZY_WEB === 'true'
  if (!isCrazyWeb) {
    plugins.push({
      name: 'strip-crazygames-sdk',
      transformIndexHtml(html: string) {
        return html.replace(
          /<!-- Load the SDK before your game code -->\s*<script[^>]*sdk\.crazygames\.com[^>]*><\/script>\s*/,
          ''
        )
      }
    })
  }

  return {
    base: '/',
    server: {
      port: 2050
    },
    define: {
      APP_VERSION: JSON.stringify(appVersion)
    },
    plugins: [
      tailwindcss(),
      vue(),
      // vueDevTools(),
      VueI18nPlugin({
        // 1. Tell the plugin where your global translation files are
        include: resolve(dirname(fileURLToPath(import.meta.url)), './src/locales/**'),

        // 2. This allows you to use YAML in the <i18n> block
        // The plugin usually detects yaml automatically, but you can force
        // strict behavior if needed by ensuring the 'yaml' loader is available.
        defaultSFCLang: 'yaml'
      }),
      ...plugins
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@/': fileURLToPath(new URL('./src/', import.meta.url)),
        '#': fileURLToPath(new URL('./src/assets', import.meta.url))
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
    },
    build: {
      minify: 'esbuild',
      // Disable source maps in production if you want maximum protection
      sourcemap: !shouldObfuscate
    }
  }
})
