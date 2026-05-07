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
    svg(
      v-for="i in maxLife"
      :key="i"
      viewBox="0 0 24 24"
      class="w-5 h-5 sm:w-6 sm:h-6"
      :class="i <= life ? 'wrench-active' : 'wrench-dead'"
    )
      path(
        d="M14 2 a4 4 0 0 1 1.6 7.6 L21 15.2 L18.8 17.4 L13.2 11.8 A4 4 0 1 1 14 2 Z M14 4 a2 2 0 0 0 0 4 a2 2 0 0 0 0 -4 Z"
        fill="currentColor"
        stroke="black"
        stroke-width="0.6"
      )
      path(
        d="M3 19.5 L11.5 11 L13 12.5 L4.5 21 a1 1 0 0 1 -1.5 -1.5 Z"
        fill="currentColor"
        stroke="black"
        stroke-width="0.6"
      )
</template>

<style scoped lang="sass">
.wrench-active
  color: #f5b342
  filter: drop-shadow(0 0 4px rgba(245, 179, 66, 0.6))

.wrench-dead
  color: #555
  opacity: 0.45
</style>
