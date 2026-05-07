<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useUser from '@/use/useUser'
import { setI18nLocale } from '@/i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import FSlider from '@/components/atoms/FSlider.vue'
import FSelect from '@/components/atoms/FSelect.vue'
import { LANGUAGES } from '@/utils/enums'
import { stopGameplay } from '@/use/useCrazyGames'

const props = defineProps<{
  isOpen: boolean
}>()

watch(() => props.isOpen, (open) => {
  if (open) stopGameplay()
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()
const { locale }: any = useI18n({ useScope: 'global' })
const appI18n: any = (window as any).__i18n

const {
  setSettingValue,
  userLanguage,
  userSoundVolume,
  userMusicVolume
} = useUser()

const currentTab = ref('general')

watch(userLanguage, async (newValue: string) => {
  if (appI18n) {
    await setI18nLocale(appI18n, newValue)
  } else {
    locale.value = newValue
  }
})

const isMobile = computed(() => {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
})

const tabs = computed(() => {
  const list = [
    { value: 'general', label: t('general') }
  ]
  return !isMobile.value ? list.concat({ label: t('audio'), value: 'audio' }) : list
})

const languagesList = computed(() => {
  return LANGUAGES.map(loc => ({
    value: loc,
    label: `${t(loc)} (${loc})`,
    locale: userLanguage.value
  }))
})
</script>

<template lang="pug">
  FModal(
    :model-value="isOpen"
    :is-closable="false"
    :title="t('options')"
    :tabs="tabs"
    v-model:activeTab="currentTab"
    @update:model-value="emit('close')"
  )
    div(v-if="currentTab === 'general'")
      div(class="flex flex-col gap-2 p-2")
        div(class="z-[10] flex flex-col gap-2 scale-80 sm:scale-100")
          FSelect(
            class="!text-[10px] md:text-[12px]"
            :label="t('language')"
            :options="languagesList"
            :model-value="userLanguage"
            @update:model-value="setSettingValue('language', $event)"
          )
        hr(class="border-slate-600 my-1 md:my-2 pt-0")
        FSlider.px-4(class="!py-1 !pb-3 !max-w-[300px]" :model-value="userSoundVolume" @update:modelValue="setSettingValue('sound', $event)" :label="t('soundEffects')" :min="0" :max="1" :step="0.01")
        FSlider.px-4(class="!py-1 !pb-2 !max-w-[300px]" :model-value="userMusicVolume" @update:modelValue="setSettingValue('music', $event)" :label="t('music')" :min="0" :max="1" :step="0.01")

    div(v-else-if="currentTab === 'audio'").flex.flex-col.justify-between.items-center
      FSlider.px-4(class="!py-1 !pb-3 !max-w-[300px]" :model-value="userSoundVolume" @update:modelValue="setSettingValue('sound', $event)" :label="t('soundEffects')" :min="0" :max="1" :step="0.01")
      FSlider.px-4(class="!py-1 !pb-2 !max-w-[300px]" :model-value="userMusicVolume" @update:modelValue="setSettingValue('music', $event)" :label="t('music')" :min="0" :max="1" :step="0.01")
      hr(class="border-slate-600 my-1 md:my-2 pt-0")

    template(#footer)
      FButton(class="px-6 sm:px-8" @click="emit('close')") {{ t('close') }}
</template>

<style lang="sass" scoped>
span
  text-shadow: 2px 2px 0 #000
</style>

<i18n lang="yaml">
en:
  options: "Options"
  general: "General"
  audio: "Audio"
  language: "Language"
  close: "Save & Close"
  soundEffects: "Sound Effects"
  music: "Music"
  en: "English"
  de: "German"
  fr: "French"
  es: "Spanish"
  jp: "Japanese"
  kr: "Korean"
  zh: "Chinese"
  ru: "Russian"
de:
  options: "Optionen"
  general: "Allgemein"
  audio: "Audio"
  language: "Sprache"
  close: "Speichern & Schließen"
  soundEffects: "Soundeffekte"
  music: "Musik"
  en: "Englisch"
  de: "Deutsch"
  fr: "Französisch"
  es: "Spanisch"
  jp: "Japanisch"
  kr: "Koreanisch"
  zh: "Chinesisch"
  ru: "Russisch"
fr:
  options: "Options"
  general: "Général"
  audio: "Audio"
  language: "Langue"
  close: "Sauvegarder et Fermer"
  soundEffects: "Effets Sonores"
  music: "Musique"
  en: "Anglais"
  de: "Allemand"
  fr: "Français"
  es: "Espagnol"
  jp: "Japonais"
  kr: "Coréen"
  zh: "Chinois"
  ru: "Russe"
es:
  options: "Opciones"
  general: "General"
  audio: "Audio"
  language: "Idioma"
  close: "Guardar y Cerrar"
  soundEffects: "Efectos de Sonido"
  music: "Música"
  en: "Inglés"
  de: "Alemán"
  fr: "Francés"
  es: "Español"
  jp: "Japonés"
  kr: "Coreano"
  zh: "Chino"
  ru: "Ruso"
jp:
  options: "オプション"
  general: "全般"
  audio: "オーディオ"
  language: "言語"
  close: "保存して閉じる"
  soundEffects: "効果音"
  music: "音楽"
  en: "英語"
  de: "ドイツ語"
  fr: "フランス語"
  es: "スペイン語"
  jp: "日本語"
  kr: "韓国語"
  zh: "中国語"
  ru: "ロシア語"
kr:
  options: "옵션"
  general: "일반"
  audio: "오디오"
  language: "언어"
  close: "저장 후 닫기"
  soundEffects: "음향 효과"
  music: "음악"
  en: "영어"
  de: "독일어"
  fr: "프랑스어"
  es: "스페인어"
  jp: "일본어"
  kr: "한국어"
  zh: "중국어"
  ru: "러시아어"
zh:
  options: "选项"
  general: "常规"
  audio: "音频"
  language: "语言"
  close: "保存并关闭"
  soundEffects: "音效"
  music: "音乐"
  en: "英语"
  de: "德语"
  fr: "法语"
  es: "西班牙语"
  jp: "日语"
  kr: "韩语"
  zh: "中文"
  ru: "俄语"
ru:
  options: "Опции"
  general: "Общие"
  audio: "Аудио"
  language: "Язык"
  close: "Сохранить и Закрыть"
  soundEffects: "Звуковые эффекты"
  music: "Музыка"
  en: "Английский"
  de: "Немецкий"
  fr: "Французский"
  es: "Испанский"
  jp: "Японский"
  kr: "Корейский"
  zh: "Китайский"
  ru: "Русский"
</i18n>
