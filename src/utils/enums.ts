import type { ENUM } from '@/types'

export const DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
} as const

export type Difficulties = (typeof DIFFICULTY)[keyof typeof DIFFICULTY]

// Maw-It-Down ships only the English locale for now (other UIs fall back to it
// via vue-i18n's `fallbackLocale: 'en'`). Adding a new translation = drop a
// `src/i18n/locales/<code>.ts` file and add the code here; the Vite glob in
// `i18n/index.ts` picks it up automatically.
export const LANGUAGES: Array<string> = [
  'en'
]
