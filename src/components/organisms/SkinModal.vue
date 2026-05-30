<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useEpicSkins, { SKINS, SKIN_COST } from '@/use/useEpicSkins'
import { prependBaseUrl } from '@/utils/function'
import useSounds from '@/use/useSound'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useI18n()
const { playSound } = useSounds()
const skinsApi = useEpicSkins()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

interface SkinView {
  id: string
  name: string
  preview: string
  owned: boolean
  selected: boolean
  canBuy: boolean
}

const cards = computed<SkinView[]>(() =>
  SKINS.map((s) => ({
    id: s.id,
    name: s.name,
    preview: prependBaseUrl(s.src),
    owned: skinsApi.isOwned(s.id),
    selected: skinsApi.isSelected(s.id),
    canBuy: skinsApi.canBuy(s.id)
  }))
)

const onCardAction = (id: string): void => {
  const api = skinsApi
  if (api.isSelected(id)) return
  if (api.isOwned(id)) {
    if (api.selectSkin(id)) playSound('anchor-swap', 0.05)
    return
  }
  if (api.buySkin(id)) playSound('level-up', 0.06)
  else playSound('barricade', 0.04)
}
</script>

<template lang="pug">
  FModal(v-model="isOpen" :title="t('skins.title')")
    div.flex.flex-col.gap-2.p-2
      p.text-center.text-white.game-text.opacity-80(class="text-xs sm:text-sm") {{ t('skins.subtitle') }}
      div.grid.gap-2(class="grid-cols-2 sm:grid-cols-3")
        div.skin-card.flex.flex-col.items-center.gap-1.rounded-xl.border-2.p-2(
          v-for="card in cards"
          :key="card.id"
          class="bg-black/30"
          :class="card.selected ? 'border-yellow-300' : 'border-white/15'"
        )
          //- Texture preview as a sphere-ish disc.
          div.relative.rounded-full.overflow-hidden.border-2.border-black/40(class="w-14 h-14 sm:w-16 sm:h-16")
            img.w-full.h-full.object-cover(:src="card.preview" alt="")
            //- Equipped check badge.
            div.absolute.flex.items-center.justify-center.rounded-full.bg-emerald-500.border-2.border-white(
              v-if="card.selected"
              class="w-5 h-5 -top-1 -right-1"
            )
              span.text-white.font-black(class="text-[10px]") ✓
          div.font-black.game-text.text-white(class="text-xs sm:text-sm") {{ card.name }}
          //- Action: equipped / equip / buy.
          div.text-center.text-emerald-300.font-black.game-text(v-if="card.selected" class="text-[10px] sm:text-xs") {{ t('skins.equipped') }}
          button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-1.rounded-lg.border-2.px-3(
            v-else
            class="py-1 active:scale-95 hover:scale-[103%] bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] disabled:opacity-50 disabled:grayscale"
            :disabled="!card.owned && !card.canBuy"
            @click="onCardAction(card.id)"
          )
            template(v-if="card.owned")
              span.font-black.game-text.text-white(class="text-xs") {{ t('skins.equip') }}
            template(v-else)
              IconCoin(class="w-4 h-4 text-yellow-100")
              span.font-black.game-text.text-white(class="text-sm") {{ SKIN_COST }}
</template>

<style scoped lang="sass">
.skin-card
  transition: all 0.15s ease
</style>
