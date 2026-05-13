<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { StageBiome } from '@/use/useMawCampaign'
import { registerChordTap } from '@/use/useVConsole'

const { t } = useI18n()

interface Props {
  stageId: number
  name: string
  isBoss?: boolean
  biome?: StageBiome
  cleared?: number
  targetClears?: number
}

const props = withDefaults(defineProps<Props>(), {
  isBoss: false,
  biome: 'forest',
  cleared: 0,
  targetClears: 0
})

const progressPct = computed(() => {
  if (!props.targetClears) return 0
  return Math.max(0, Math.min(100, (props.cleared / props.targetClears) * 100))
})

const progressLabel = computed(() => {
  if (!props.targetClears) return ''
  return `${Math.min(props.cleared, props.targetClears)} / ${props.targetClears}`
})

const progressComplete = computed(() => props.targetClears > 0 && props.cleared >= props.targetClears)

const displayName = computed(() => {
  // Keyed by stage id so locales don't need to track the literal English
  // names. The English bundle round-trips back to `props.name` via the
  // i18n fallback.
  return t(`stages.s${props.stageId}`, props.name)
})

interface StageTheme {
  from: string
  to: string
  border: string
  shadowBase: string
  number: string
  numberShadow: string
  accent: string
  glow: string
}

const stageTheme = computed<StageTheme>(() => {
  if (props.isBoss) {
    return {
      from: 'from-red-600',
      to: 'to-red-900',
      border: 'border-red-300',
      shadowBase: 'bg-red-950',
      number: 'text-red-100',
      numberShadow: 'bg-red-950/70',
      accent: 'text-red-200',
      glow: 'shadow-red-500/60'
    }
  }
  switch (props.biome) {
    case 'wheat':
      return {
        from: 'from-amber-400',
        to: 'to-amber-700',
        border: 'border-amber-200',
        shadowBase: 'bg-amber-950',
        number: 'text-amber-50',
        numberShadow: 'bg-amber-950/70',
        accent: 'text-amber-100',
        glow: 'shadow-amber-400/60'
      }
    case 'flower':
      return {
        from: 'from-fuchsia-400',
        to: 'to-fuchsia-800',
        border: 'border-fuchsia-200',
        shadowBase: 'bg-fuchsia-950',
        number: 'text-fuchsia-50',
        numberShadow: 'bg-fuchsia-950/70',
        accent: 'text-fuchsia-100',
        glow: 'shadow-fuchsia-400/60'
      }
    case 'rocky':
      return {
        from: 'from-slate-400',
        to: 'to-slate-800',
        border: 'border-slate-200',
        shadowBase: 'bg-slate-950',
        number: 'text-slate-50',
        numberShadow: 'bg-slate-950/70',
        accent: 'text-slate-100',
        glow: 'shadow-slate-400/60'
      }
    case 'forest':
    default:
      return {
        from: 'from-green-500',
        to: 'to-green-800',
        border: 'border-green-300',
        shadowBase: 'bg-green-950',
        number: 'text-green-100',
        numberShadow: 'bg-green-950/70',
        accent: 'text-green-200',
        glow: 'shadow-green-500/60'
      }
  }
})
</script>

<template lang="pug">
  div.stage-badge.relative.pointer-events-auto(
    @pointerdown="registerChordTap"
    @touchstart="registerChordTap"
    @click="registerChordTap"
    class="cursor-pointer"
    style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
  )
    div.absolute.inset-0.translate-y-1.rounded-xl.opacity-80(
      :class="stageTheme.shadowBase"
      class="pointer-events-none"
    )
    div.relative.flex.items-center.gap-2.rounded-xl.border-2.shadow-lg.overflow-hidden(
      :class="['bg-gradient-to-b', stageTheme.from, stageTheme.to, stageTheme.border, stageTheme.glow]"
      class="pl-1.5 pr-3 py-1"
    )
      div.relative.flex.items-center.justify-center.rounded-lg.border(
        :class="[stageTheme.numberShadow, stageTheme.border]"
        class="min-w-7 h-7 sm:min-w-8 sm:h-8 px-1"
      )
        span.font-black.game-text.leading-none(
          :class="stageTheme.number"
          class="text-sm sm:text-base"
        ) {{ isBoss ? `\u{1F480}${stageId}` : stageId }}
      div.flex.flex-col.leading-tight
        span.font-black.uppercase.tracking-wider.game-text.text-white(
          class="text-[9px] sm:text-[11px] opacity-90"
        ) {{ isBoss ? t('bossStage') : t('stage') + ' ' + stageId }}
        span.font-bold.italic.game-text(
          :class="stageTheme.accent"
          class="text-[10px] sm:text-xs"
        ) {{ displayName }}
        //- Stage progress bar (mawed-grass tracker).
        div.stage-progress(
          v-if="targetClears > 0"
          class="relative mt-1 w-[100px] sm:w-[124px] h-3 rounded-full overflow-hidden border"
          :class="['bg-black/55', stageTheme.border]"
        )
          //- Filled portion.
          div.stage-progress__fill.absolute.inset-y-0.left-0.rounded-full(
            :class="progressComplete ? 'progress-complete' : 'progress-active'"
            :style="{ width: progressPct + '%' }"
          )
          //- Glossy highlight strip.
          div.absolute.inset-x-0.top-0.pointer-events-none(class="h-[1px] bg-white/40")
          //- Numeric label centered over the bar.
          div.absolute.inset-0.flex.items-center.justify-center.pointer-events-none
            span.font-bold.text-white(
              class="text-[7px] sm:text-[8px] leading-none tabular-nums"
              style="text-shadow: 0 1px 0 #000, 0 0 2px rgba(0,0,0,0.9); letter-spacing: 0.01em;"
            ) {{ progressLabel }}
</template>

<style scoped lang="sass">
.stage-progress__fill
  transition: width 220ms ease-out
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 -1px 0 rgba(0, 0, 0, 0.35)

.progress-active
  background: linear-gradient(180deg, #b3ff7a 0%, #4ec045 50%, #1f7a2c 100%)

.progress-complete
  background: linear-gradient(90deg, #ffd86b, #ffb347, #ffd86b)
  background-size: 200% 100%
  animation: progress-shimmer 1100ms linear infinite
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 0 6px rgba(255, 200, 90, 0.7)

@keyframes progress-shimmer
  0%
    background-position: 0% 0
  100%
    background-position: 200% 0
</style>
