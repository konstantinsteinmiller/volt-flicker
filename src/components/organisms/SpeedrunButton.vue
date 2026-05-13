<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { speedrunMode, toggleSpeedrunMode, ghostBestTime } from '@/use/useMawGhost'

const { t } = useI18n()

const props = defineProps<{
  /** Live elapsed time in ms for the current attempt — 0 when no run
   *  is in progress. MawScene drives this from its renderLoop. */
  elapsedMs: number
  /** Active stage id for the best-time readout. */
  stageId: number
  /** True only while the player is actively in a run, so we hide the
   *  timer between attempts instead of freezing it. */
  isPlaying: boolean
}>()

const onToggle = () => { toggleSpeedrunMode() }

const formatMs = (ms: number): string => {
  if (ms <= 0) return '0.0s'
  const s = Math.floor(ms / 1000)
  const tenth = Math.floor((ms % 1000) / 100)
  return `${s}.${tenth}s`
}

const liveLabel = computed(() => formatMs(props.elapsedMs))
const bestLabel = computed(() => {
  const ms = ghostBestTime(props.stageId)
  return ms === null ? '—' : formatMs(ms)
})
/** When the player is ahead of their best time at this exact instant
 *  the live timer flips green; when they're slower it goes red. Neutral
 *  yellow when there's no prior best to compare against. */
const liveColor = computed(() => {
  const best = ghostBestTime(props.stageId)
  if (best === null || !props.isPlaying || props.elapsedMs <= 0) return 'neutral'
  return props.elapsedMs <= best ? 'ahead' : 'behind'
})
</script>

<template lang="pug">
  div.speedrun-stack.flex.flex-col.items-end.gap-1
    button.speedrun-btn(
      :class="{ active: speedrunMode }"
      type="button"
      @click="onToggle"
      :title="speedrunMode ? 'Speedrun mode ON — race your best time' : 'Toggle Speedrun mode'"
    )
      //- Stopwatch icon — outer ring, top stem, hand at 2 o'clock.
      svg(viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round")
        path(d="M10 2 H14")
        path(d="M12 4 V6")
        circle(cx="12" cy="14" r="8")
        path(d="M12 14 L15.5 11")
    div.speedrun-timer(
      v-if="speedrunMode"
      :class="liveColor"
    )
      div.timer-row
        span.opacity-70 ⏱
        span.font-mono.font-black {{ liveLabel }}
      div.timer-row(class="text-[10px] opacity-70")
        span {{ t('speedrun.best') }}
        span.font-mono {{ bestLabel }}
</template>

<style scoped lang="sass">
.speedrun-btn
  display: flex
  align-items: center
  justify-content: center
  width: 38px
  height: 38px
  border-radius: 0.5rem
  border: 2px solid #0f1a30
  background: linear-gradient(180deg, #6b46c1, #4c1d95)
  color: white
  cursor: pointer
  transition: transform 0.08s ease, filter 0.08s ease

  &:hover
    transform: scale(1.05)
    filter: brightness(1.1)

  &:active
    transform: scale(0.94)

  &.active
    background: linear-gradient(180deg, #ec4899, #9d174d)
    box-shadow: 0 0 14px rgba(236, 72, 153, 0.6)

.speedrun-timer
  min-width: 88px
  padding: 0.2rem 0.45rem
  border-radius: 0.4rem
  background: rgba(0, 0, 0, 0.55)
  border: 2px solid rgba(255, 255, 255, 0.15)
  color: white
  text-shadow: 1px 1px 0 #000
  line-height: 1.1

  &.ahead
    border-color: rgba(74, 222, 128, 0.65)
    color: #bbf7d0

  &.behind
    border-color: rgba(248, 113, 113, 0.65)
    color: #fecaca

  &.neutral
    color: #fde68a

.timer-row
  display: flex
  justify-content: space-between
  align-items: center
  gap: 0.4rem
  font-size: 0.85rem
</style>
