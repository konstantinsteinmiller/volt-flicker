<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { activePowerup, POWERUPS, type PowerupType } from '@/use/usePowerups'

interface Props {
  /** 1 → 0 countdown fraction, driven by the game clock from the scene. */
  fraction: number
}
const props = defineProps<Props>()
const { t } = useI18n()

const type = computed<PowerupType | null>(() => activePowerup.value?.type ?? null)
const color = computed(() => (type.value ? POWERUPS[type.value].color : '#ffffff'))
const label = computed(() => (type.value ? t(`powerups.${type.value}`) : ''))
const pct = computed(() => Math.max(0, Math.min(1, props.fraction)) * 100)
</script>

<template lang="pug">
  Transition(name="slide-up")
    div.powerup-banner.pointer-events-none(v-if="type")
      div.powerup-banner__inner(:style="{ borderColor: color, boxShadow: `0 0 16px ${color}aa` }")
        div.powerup-banner__fill(:style="{ width: pct + '%', background: color }")
        span.powerup-banner__label.game-text(:style="{ color: '#fff' }") {{ label }}
</template>

<style scoped lang="sass">
.powerup-banner
  width: min(86vw, 22rem)

.powerup-banner__inner
  position: relative
  height: 2.2rem
  border-radius: 9999px
  border: 2px solid #fff
  background: rgba(10, 16, 32, 0.78)
  overflow: hidden
  display: flex
  align-items: center
  justify-content: center

.powerup-banner__fill
  position: absolute
  left: 0
  top: 0
  bottom: 0
  opacity: 0.45
  transition: width 0.12s linear

.powerup-banner__label
  position: relative
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.12em
  font-size: clamp(0.8rem, 3.6vw, 1.05rem)
  text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000

.slide-up-enter-active, .slide-up-leave-active
  transition: all 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28)

.slide-up-enter-from, .slide-up-leave-to
  opacity: 0
  transform: translateY(12px) scale(0.9)
</style>
