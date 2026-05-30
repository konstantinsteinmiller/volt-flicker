<script setup lang="ts">
import { watch, ref } from 'vue'

interface Props {
  score: number
}
const props = defineProps<Props>()

// Pop the number on every increment for tactile feedback.
const popping = ref(false)
let raf = 0
watch(() => props.score, () => {
  popping.value = false
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => { popping.value = true })
})
</script>

<template lang="pug">
  div.score-badge.pointer-events-none.flex.flex-col.items-center.select-none
    span.score-num.font-black.game-text.leading-none(
      :class="{ pop: popping }"
    ) {{ score }}
</template>

<style scoped lang="sass">
.score-num
  color: #ffffff
  font-size: clamp(2.75rem, 13vw, 6rem)
  text-shadow: 0 4px 0 #1a2b4b, 0 0 18px rgba(0,0,0,0.45), 3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000
  letter-spacing: 0.02em
  transition: transform 0.08s ease-out

.pop
  animation: score-pop 0.18s ease-out

@keyframes score-pop
  0%
    transform: scale(1)
  40%
    transform: scale(1.18)
  100%
    transform: scale(1)
</style>
