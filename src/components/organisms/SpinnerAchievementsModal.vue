<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useMawProgress, { ACHIEVEMENTS } from '@/use/useMawProgress'
import useMawConfig from '@/use/useMawConfig'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import { stopGameplay } from '@/use/useCrazyGames'
import useSounds from '@/use/useSound.ts'

const props = defineProps<{
  modelValue: boolean
  /** Coin badge element to fly the coin VFX to. */
  targetEl?: HTMLElement | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const { t } = useI18n()
const { achievements, isAchUnlocked, isAchClaimed, claimAchievement } = useMawProgress()
const { addCoins } = useMawConfig()
const { playSound } = useSounds()

watch(() => props.modelValue, (open) => { if (open) stopGameplay() })

// ─── Crest theming ─────────────────────────────────────────────────────────
//
// The spin-and-mow achievement list defines `id, name, description, reward,
// goal, metric` — there's no glyph or palette for the crest. We map each id
// to a 1-3 char glyph and a 3-stop color palette here so the visual catalog
// stays inside the view layer (where the crest lives).
interface CrestTheme {
  glyph: string
  color: { from: string; to: string; accent: string }
}

const CREST_THEMES: Record<string, CrestTheme> = {
  'first-cut':    { glyph: 'I',   color: { from: '#86efac', to: '#16a34a', accent: '#064e20' } },
  'green-thumb':  { glyph: 'X',   color: { from: '#a3e635', to: '#65a30d', accent: '#1a2e05' } },
  'lawn-tycoon':  { glyph: '★',   color: { from: '#fde047', to: '#ca8a04', accent: '#422006' } },
  'coin-hoarder': { glyph: '$',   color: { from: '#fef9c3', to: '#facc15', accent: '#451a03' } },
  'tycoon':       { glyph: '$$',  color: { from: '#fef08a', to: '#d97706', accent: '#451a03' } },
  'survivor':     { glyph: 'V',   color: { from: '#60a5fa', to: '#1d4ed8', accent: '#0b1d5c' } },
  'territorial':  { glyph: 'X',   color: { from: '#c084fc', to: '#6b21a8', accent: '#2e0a4a' } },
  'lumberjack':   { glyph: '⌖',   color: { from: '#fdba74', to: '#c2410c', accent: '#431407' } },
  'persistent':   { glyph: '∞',   color: { from: '#f472b6', to: '#be185d', accent: '#4a0a2d' } },
  'champion':     { glyph: '♛',   color: { from: '#fef08a', to: '#ea580c', accent: '#431407' } }
}

const FALLBACK_THEME: CrestTheme = {
  glyph: '?',
  color: { from: '#94a3b8', to: '#475569', accent: '#1e293b' }
}

const cards = computed(() => ACHIEVEMENTS.map(a => {
  const value = achievements.value.totals[a.metric] ?? 0
  const theme = CREST_THEMES[a.id] ?? FALLBACK_THEME
  return {
    ...a,
    progress: Math.min(value, a.goal),
    pct: Math.min(1, value / a.goal),
    unlocked: isAchUnlocked(a.id),
    claimed: isAchClaimed(a.id),
    glyph: theme.glyph,
    color: theme.color
  }
}))

const onClaim = (id: string, sourceEl: EventTarget | null) => {
  const reward = claimAchievement(id)
  if (reward <= 0) return
  addCoins(reward)
  playSound('level-up', 0.08)
  if (sourceEl instanceof HTMLElement && props.targetEl) {
    spawnCoinExplosion({ sourceEl, targetEl: props.targetEl })
  }
}
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    :title="t('achievements.title')"
    @update:model-value="emit('update:modelValue', $event)"
  )
    div.flex.flex-col.gap-2.p-2
      p.text-center.text-white.game-text(class="text-xs sm:text-sm opacity-80") {{ t('achievements.subtitle') }}

      div.grid.gap-3(class="grid-cols-1 sm:grid-cols-2")
        div.ach-card(
          v-for="card in cards"
          :key="card.id"
          :class="{ 'is-unlocked': card.unlocked, 'is-claimed': card.claimed }"
        )
          //- Crest badge — full SVG copied from the spinner modal, with the
          //- locked / unlocked state driven by the spin-and-mow claim system.
          div.ach-crest.shrink-0
            svg.ach-crest__svg(viewBox="-60 -60 120 120" xmlns="http://www.w3.org/2000/svg")
              defs
                linearGradient(:id="`ach-body-${card.id}`" x1="0%" y1="0%" x2="0%" y2="100%")
                  stop(offset="0%" :stop-color="card.unlocked ? card.color.from : '#64748b'")
                  stop(offset="100%" :stop-color="card.unlocked ? card.color.to : '#1f2937'")
                linearGradient(:id="`ach-ribbon-${card.id}`" x1="0%" y1="0%" x2="0%" y2="100%")
                  stop(offset="0%" :stop-color="card.unlocked ? card.color.from : '#94a3b8'")
                  stop(offset="100%" :stop-color="card.unlocked ? card.color.accent : '#334155'")
                filter(:id="`ach-halo-${card.id}`" x="-75%" y="-75%" width="250%" height="250%")
                  feGaussianBlur(in="SourceGraphic" stdDeviation="6")

              //- Soft glow behind the unlocked crest.
              g(v-if="card.unlocked" :filter="`url(#ach-halo-${card.id})`" opacity="0.75")
                circle(cx="0" cy="0" r="42" :fill="card.color.from")

              //- Laurel wreath — two curved leaf clusters on the sides.
              g(:stroke="card.unlocked ? card.color.accent : '#475569'" stroke-width="2" fill="none" stroke-linecap="round")
                path(d="M-46 -8 Q-54 10 -42 30")
                path(d="M-46 -4 Q-52 8 -42 20")
                path(d="M46 -8 Q54 10 42 30")
                path(d="M46 -4 Q52 8 42 20")
              g(:fill="card.unlocked ? card.color.from : '#64748b'")
                ellipse(cx="-50" cy="-2" rx="4" ry="2" transform="rotate(30 -50 -2)")
                ellipse(cx="-50" cy="10" rx="4" ry="2" transform="rotate(55 -50 10)")
                ellipse(cx="-48" cy="22" rx="4" ry="2" transform="rotate(80 -48 22)")
                ellipse(cx="50" cy="-2" rx="4" ry="2" transform="rotate(-30 50 -2)")
                ellipse(cx="50" cy="10" rx="4" ry="2" transform="rotate(-55 50 10)")
                ellipse(cx="48" cy="22" rx="4" ry="2" transform="rotate(-80 48 22)")

              //- Shield body.
              path(
                d="M0 -46 L36 -34 L36 6 Q36 32 0 46 Q-36 32 -36 6 L-36 -34 Z"
                :fill="`url(#ach-body-${card.id})`"
                :stroke="card.unlocked ? card.color.accent : '#111827'"
                stroke-width="3"
                stroke-linejoin="round"
              )
              //- Inner chevron.
              path(
                d="M-28 -18 L0 -6 L28 -18 L28 -2 L0 10 L-28 -2 Z"
                :fill="card.unlocked ? card.color.accent : '#0f172a'"
                opacity="0.55"
              )
              //- Inner rim.
              path(
                d="M0 -40 L30 -30 L30 4 Q30 26 0 40 Q-30 26 -30 4 L-30 -30 Z"
                fill="none"
                :stroke="card.unlocked ? '#ffffff' : '#94a3b8'"
                stroke-width="1.4"
                opacity="0.5"
              )

              //- Glyph (1-3 char identifier baked in the centre).
              text(
                x="0"
                y="8"
                text-anchor="middle"
                font-family="'Inter', sans-serif"
                font-weight="900"
                font-size="20"
                :fill="card.unlocked ? '#ffffff' : '#94a3b8'"
                style="text-shadow: 1px 1px 0 #000;"
              ) {{ card.glyph }}

              //- Ribbon banner across the bottom.
              g
                path(
                  d="M-34 36 L-30 50 L-14 46 L-14 36 Z"
                  :fill="`url(#ach-ribbon-${card.id})`"
                  :stroke="card.unlocked ? card.color.accent : '#111827'"
                  stroke-width="1.5"
                  stroke-linejoin="round"
                )
                path(
                  d="M34 36 L30 50 L14 46 L14 36 Z"
                  :fill="`url(#ach-ribbon-${card.id})`"
                  :stroke="card.unlocked ? card.color.accent : '#111827'"
                  stroke-width="1.5"
                  stroke-linejoin="round"
                )
                rect(
                  x="-18" y="34" width="36" height="14" rx="2"
                  :fill="`url(#ach-ribbon-${card.id})`"
                  :stroke="card.unlocked ? card.color.accent : '#111827'"
                  stroke-width="1.5"
                )
                //- Tiny dot in the ribbon when the reward has been claimed.
                g(v-if="card.claimed")
                  circle(cx="0" cy="41" r="3" fill="#ffffff")

              //- Lock overlay for goal-not-yet-reached crests.
              g(v-if="!card.unlocked")
                circle(cx="0" cy="0" r="14" fill="rgba(0,0,0,0.65)" stroke="#94a3b8" stroke-width="2")
                rect(x="-5" y="-3" width="10" height="9" rx="1.5" fill="#cbd5e1")
                path(d="M-3 -3 Q-3 -10 0 -10 Q3 -10 3 -3" fill="none" stroke="#cbd5e1" stroke-width="2")

          //- Title / description / progress — stacked next to the crest.
          div.flex.flex-col.gap-1.flex-1.min-w-0
            span.font-black.game-text.text-white.uppercase.tracking-wider(class="text-sm sm:text-base") {{ card.name }}
            span.text-white.game-text.opacity-75(class="text-[10px] sm:text-xs") {{ card.description }}
            div.relative.h-2.rounded-full.overflow-hidden.border(class="bg-black/40 border-white/20")
              div.h-full.bg-gradient-to-r.from-yellow-300.to-yellow-500.transition-all(:style="{ width: card.pct * 100 + '%' }")
            span.text-white.game-text.opacity-70.tabular-nums(class="text-[9px]") {{ t('achievements.progress', { current: card.progress, goal: card.goal }) }}

          //- Reward + claim — far right column.
          div.flex.flex-col.items-center.gap-1.shrink-0(class="ml-1")
            div.flex.items-center(class="gap-0.5")
              IconCoin(class="w-4 h-4 text-yellow-300")
              span.font-black.game-text.text-yellow-100(class="text-xs") {{ card.reward }}
            button.claim-btn(
              :disabled="!card.unlocked || card.claimed"
              @click="onClaim(card.id, $event.currentTarget)"
            ) {{ card.claimed ? t('achievements.claimed') : t('achievements.claim') }}
</template>

<style scoped lang="sass">
.ach-card
  display: flex
  align-items: center
  gap: 0.6rem
  padding: 0.55rem 0.65rem
  border-radius: 0.75rem
  background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%)
  border: 2px solid #334155
  transition: border-color 0.18s ease, box-shadow 0.18s ease

  &.is-unlocked:not(.is-claimed)
    border-color: #fcd34d
    box-shadow: 0 0 10px rgba(252, 211, 77, 0.3)

  &.is-claimed
    opacity: 0.7

.ach-crest
  width: 4.75rem
  height: 4.75rem

  @media (min-width: 640px)
    width: 5.5rem
    height: 5.5rem

.ach-crest__svg
  width: 100%
  height: 100%
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.7))

.claim-btn
  padding: 0.25rem 0.6rem
  border-radius: 0.5rem
  font-weight: 900
  font-size: 0.7rem
  text-transform: uppercase
  cursor: pointer
  background: linear-gradient(180deg, #ffcd00, #f7a000)
  border: 2px solid #0f1a30
  color: white
  text-shadow: 1px 1px 0 #000
  transition: transform 0.1s ease

  &:hover:not(:disabled)
    transform: scale(1.05)

  &:disabled
    opacity: 0.5
    cursor: not-allowed
    background: #444

  &:active:not(:disabled)
    transform: scale(0.95)
</style>
