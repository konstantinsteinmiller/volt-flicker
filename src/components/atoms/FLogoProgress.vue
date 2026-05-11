<template lang="pug">
  Transition(name="splash-fade")
    div.splash-backdrop.no-os-ui(v-if="!backdropHidden")

  //- Logo only renders during the loading sequence. Once `done` flips
  //- true (progress = 100% OR the 4s fallback fires), the logo fades out
  //- and unmounts — it deliberately does NOT shrink to the top-left
  //- corner like the previous splash flow.
  Transition(name="logo-fade")
    div.no-os-ui(
      v-if="!done"
      ref="logoRef"
      class="fixed z-[200] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
    )
      div(class="relative flex flex-col items-center")
        div(:style="sizeStyle")
          img(
            src="/images/logo/logo_256x256.webp"
            alt="Maw It Down"
            class="w-full h-full object-contain"
            draggable="false"
          )

        //- Loading Text
        div.absolute.-bottom-8(class="mt-0 flex flex-col items-center gap-1")
          span(class="percentage-text text-shadow font-mono text-amber-500") {{ Math.round(progress) }}%

        Transition(name="hint-fade")
          div.stuck-hint.mt-4(v-if="showStuckHint")
            | Loading taking too long? Try disabling your ad blocker and refresh.
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import useAssets from '@/use/useAssets'
import { stopLoading } from '@/use/useCrazyGames'

const { loadingProgress, preloadAssets } = useAssets()
const progress = computed(() => loadingProgress.value)

void preloadAssets()

const done = ref(false)
const backdropHidden = ref(false)
const showStuckHint = ref(false)
let stuckHintId: number | null = null

const viewportSize = ref(Math.min(window.innerWidth, window.innerHeight))
const logoRef = ref<HTMLElement | null>(null)

const onResize = () => {
  viewportSize.value = Math.min(window.innerWidth, window.innerHeight)
}

let settleFallbackId: number | null = null

onMounted(() => {
  window.addEventListener('resize', onResize)

  const staticSplash = document.getElementById('static-splash')
  if (staticSplash) {
    staticSplash.classList.add('hidden')
    setTimeout(() => staticSplash.remove(), 500)
  }

  // Hard fallback so the splash always clears, even if the asset loader
  // never reports 100% (offline / blocked images / dropped requests).
  settleFallbackId = window.setTimeout(() => {
    if (!done.value) done.value = true
  }, 4000)
  stuckHintId = window.setTimeout(() => {
    if (!done.value) showStuckHint.value = true
  }, 10000)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  if (settleFallbackId !== null) clearTimeout(settleFallbackId)
  if (stuckHintId !== null) clearTimeout(stuckHintId)
})

const centeredSize = computed(() => Math.floor(viewportSize.value * 0.4))
const sizeStyle = computed(() => ({
  width: `${centeredSize.value}px`,
  height: `${centeredSize.value}px`
}))

// `immediate: true` fires the handler with the current value the moment
// the watcher is set up. Without it, an asset loader that already reports
// 100% (instant boots, especially on localhost) never trips the watcher
// and the splash sits around for the full 4s `settleFallbackId` window.
watch(progress, (val) => {
  if (val >= 100 && !done.value) {
    setTimeout(() => { done.value = true }, 100)
  }
}, { immediate: true })

let cgLoadSignaled = false
const signalGameReadyToCG = () => {
  if (cgLoadSignaled) return
  cgLoadSignaled = true
  try { stopLoading() } catch (e) { console.warn('[FLogoProgress] CG ready-to-play failed', e) }
}

watch(done, (isDone) => {
  if (isDone) {
    setTimeout(() => {
      backdropHidden.value = true
      signalGameReadyToCG()
    }, 150)
  }
})
</script>

<style scoped lang="sass">
.no-os-ui
  caret-color: transparent
  user-select: none
  -webkit-user-select: none
  -webkit-touch-callout: none
  -webkit-tap-highlight-color: transparent

  &, & *
    -webkit-user-drag: none

.percentage-text
  font-size: 1.2rem
  font-weight: bold

.splash-backdrop
  position: fixed
  inset: 0
  z-index: 150
  background-color: #0d2a18
  background-image: url('/images/bg/bg-tile_400x400.webp')
  background-repeat: repeat
  background-size: 400px 400px

.splash-fade-leave-active
  transition: opacity 0.4s ease-out
  pointer-events: none

.splash-fade-leave-to
  opacity: 0

.logo-fade-leave-active
  transition: opacity 0.35s ease-out, transform 0.35s ease-out
  pointer-events: none

.logo-fade-leave-to
  opacity: 0
  transform: translate(-50%, -50%) scale(0.85)

.stuck-hint
  color: rgba(255, 200, 0, 0.85)
  font-size: 0.9rem
  text-align: center
  max-width: 80vw
</style>
