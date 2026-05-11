<template lang="pug">
  Transition(name="fade")
    //- Ensure classes with special characters are in parentheses
    div.fixed.inset-0.flex.flex-col.items-center.justify-center.backdrop-blur-md.p-4.touch-none.cursor-pointer(
      v-if="modelValue"
      class="z-[100] bg-black/60"
      :style="{\
        paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',\
        paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',\
        paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',\
        paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))'\
      }"
      @click="handleOverlayClick"
    )
      //- Programmatic ribbon header
      div.ribbon-wrap.relative.mb-10(
        v-if="$slots.ribbon"
        :class="{ '!mb-2 -mt-2': isMobileLandscape, 'is-desktop': !isMobileLandscape && !isMobilePortrait }"
      )
        div.ribbon-banner
          div.ribbon-tail.ribbon-tail-left
          div.ribbon-tail.ribbon-tail-right
          div.ribbon-content
            slot(name="ribbon")
              span.text-white.font-black.uppercase.italic.game-text {{ t('rewards') }}

      div.relative.w-full.h-full.flex.flex-col.items-center.justify-center
        slot

      Transition(name="fade")
        div.absolute.bottom-8.left-0.right-0.flex.justify-center.animate-pulse.pointer-events-none(
          v-if="showContinue"
          class="sm:bottom-12"
        )
          div.text-sm.text-center.text-white.font-black.uppercase.italic.tracking-widest.brawl-text(class="md:text-2xl")
            | {{ isMobile ? t('tapToContinue') : t('clickToContinue') }}
</template>

<script setup lang="ts">
import { computed, useSlots, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { isMobileLandscape, isMobilePortrait } from '@/use/useUser'

const props = defineProps<{
  modelValue: boolean
  showContinue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'continue'): void
}>()

const { t } = useI18n()
const slots = useSlots()

const isMobile = computed(() => {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
})

const handleOverlayClick = () => {
  if (props.showContinue) emit('continue')
}

// Desktop shortcut: Space / Enter triggers the same "continue" action
// the overlay click does, but only while the reward is up AND in
// continue-mode. Listener is attached only when the modal becomes
// visible so background views aren't intercepting these keys.
const onContinueKey = (e: KeyboardEvent) => {
  if (!props.modelValue || !props.showContinue) return
  if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return
  // Skip when focus is on a typing target — players might be editing
  // toolbar inputs in the background.
  const t = e.target
  if (t instanceof HTMLElement) {
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
    if (t.isContentEditable) return
  }
  e.preventDefault()
  emit('continue')
}

watch(() => props.modelValue, (open) => {
  if (open) window.addEventListener('keydown', onContinueKey)
  else window.removeEventListener('keydown', onContinueKey)
}, { immediate: true })

onUnmounted(() => {
  window.removeEventListener('keydown', onContinueKey)
})
</script>

<style scoped lang="sass">
.fade-enter-active, .fade-leave-active
  transition: opacity 0.4s ease

.fade-enter-from, .fade-leave-to
  opacity: 0

.brawl-text
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

// ─── Parchment ribbon ────────────────────────────────────────────────────────

.ribbon-wrap
  position: relative
  width: 80vw
  max-width: 480px

  &.is-desktop
    @media (min-height: 501px)
      width: 70vw
      max-width: 360px

.ribbon-banner
  position: relative
  height: 70px
  display: flex
  align-items: center
  justify-content: center
  background: linear-gradient(180deg, #b08454 0%, #8a5a30 60%, #5a341a 100%)
  border-top: 3px solid #d4a674
  border-bottom: 3px solid #3a1f0c
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 230, 200, 0.4)
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))

.ribbon-tail
  position: absolute
  top: 8px
  bottom: 8px
  width: 28px
  background: linear-gradient(180deg, #6a3f1c 0%, #3a1f0c 100%)
  border: 2px solid #2a1407

.ribbon-tail-left
  left: -22px
  clip-path: polygon(100% 0, 0 50%, 100% 100%)

.ribbon-tail-right
  right: -22px
  clip-path: polygon(0 0, 100% 50%, 0 100%)

.ribbon-content
  position: relative
  z-index: 2
  display: flex
  align-items: center
  justify-content: center
  text-align: center
  padding: 0 28px

@media (orientation: landscape) and (max-height: 500px)
  .ribbon-wrap
    width: 50vw
    max-width: 400px

// Short but not landscape-mobile (e.g. CG iframe in landscape with the
// portal chrome bar visible — ~700–860 px viewport). The default desktop
// ribbon (max 400 px wide → ~136 px tall) eats too much vertical room
// here, leaving no space for the result text + wheel + spin-again
// buttons. Cap it tighter so the roulette overlay's chrome fits the
// viewport. CG QA caught the overflow 2026-05-05.
@media (orientation: landscape) and (min-height: 501px) and (max-height: 860px)
  .ribbon-wrap.is-desktop
    width: 50vw
    max-width: 320px

</style>
