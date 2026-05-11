<script setup lang="ts">
/**
 * Life-pip strip — a row of wrench icons, one per `maxLife` slot, lit
 * for indices `i <= life`. Encapsulated out of MawScene so the HUD can
 * compose it independently (e.g. stack it under the StageBadge).
 */
interface Props {
  life: number
  maxLife: number
}

defineProps<Props>()
</script>

<template lang="pug">
  div.life-badge.flex.items-center.gap-1(
    class="px-2 py-1 rounded-lg border-2 bg-black/40 border-white/15"
  )
    img.wrench-pip(
      v-for="i in maxLife"
      :key="i"
      src="/images/props/wrench_128x128.webp"
      alt=""
      draggable="false"
      class="w-5 h-5 sm:w-6 sm:h-6"
      :class="i <= life ? 'wrench-active' : 'wrench-dead'"
    )
</template>

<style scoped lang="sass">
// Bitmap-based life pips. The wrench art is single-colour so we use
// a yellow drop-shadow for the "lit" state and a grayscale + dim
// filter for the "spent" state to keep the read at a glance.
.wrench-pip
  display: inline-block
  user-select: none

.wrench-active
  filter: drop-shadow(0 0 4px rgba(245, 179, 66, 0.75))

.wrench-dead
  filter: grayscale(0.85) brightness(0.7)
  opacity: 0.45
</style>
