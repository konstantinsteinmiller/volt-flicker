import type { ENUM } from '@/types'

export const DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
} as const

export type Difficulties = (typeof DIFFICULTY)[keyof typeof DIFFICULTY]

// Languages enabled in the OptionsModal picker. Each entry MUST have a
// matching `src/i18n/locales/<code>.ts` file — the Vite glob in
// `i18n/index.ts` registers each one as its own dynamic-import chunk so
// they only ship when the player actually switches to that language.
// English is statically bundled (fallback locale); every other code is
// fetched on demand. To add a 9th language: drop a new file under
// `locales/`, append the code here.
export const LANGUAGES: Array<string> = [
  'en',
  'de',
  'fr',
  'es',
  'jp',
  'kr',
  'zh',
  'ru'
]
