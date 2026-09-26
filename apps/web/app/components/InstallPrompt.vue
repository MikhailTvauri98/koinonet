<script setup lang="ts">
// Подсказка установки PWA на домашний экран (CONTEXT.md, «Подсказка
// установки»). На iOS Safari нет `beforeinstallprompt` — там показываем
// инструкцию «Поделиться → На экран „Домой“». На Android/Chrome перехватываем
// `beforeinstallprompt` и предлагаем установку кнопкой, которая вызывает
// стандартный диалог браузера. Уже установленному приложению (standalone)
// подсказка не показывается вовсе, отказ от неё запоминается в localStorage.
import { computed, onMounted, onUnmounted, ref } from 'vue'

// Ключ в localStorage: свой, не завязанный на @vite-pwa/nuxt — его
// собственный клиентский плагин (и вместе с ним `vite-pwa:hide-install`)
// выключен целиком через client.registerPlugin: false в nuxt.config.ts (см.
// комментарий там же и отчёт задачи 31 — виртуальный модуль плагина ломает
// компонентные тесты).
const DISMISS_KEY = 'install-prompt:dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === 'true'
  }
  catch {
    // Приватный режим может бросить исключение при обращении к localStorage:
    // считаем подсказку не отклонённой, а не роняем компонент.
    return false
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, 'true')
  }
  catch {
    // Не удалось запомнить отказ — подсказка вернётся при следующем визите,
    // это не повод падать.
  }
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua)
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return isIos && !isOtherIosBrowser && /Safari/.test(ua)
}

const dismissed = ref(readDismissed())
const standalone = ref(isStandalone())
const iosSafari = ref(isIosSafari())
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)

function onBeforeInstallPrompt(event: Event): void {
  // Отменяет мини-инфобар браузера по умолчанию — свою кнопку показываем сами.
  event.preventDefault()
  deferredPrompt.value = event as BeforeInstallPromptEvent
}

function onAppInstalled(): void {
  deferredPrompt.value = null
  standalone.value = true
}

onMounted(() => {
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
})

onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.removeEventListener('appinstalled', onAppInstalled)
})

const variant = computed<'ios' | 'android' | null>(() => {
  if (standalone.value || dismissed.value) return null
  if (iosSafari.value) return 'ios'
  if (deferredPrompt.value) return 'android'
  return null
})

async function install(): Promise<void> {
  const event = deferredPrompt.value
  if (!event) return
  event.prompt()
  try {
    await event.userChoice
  }
  finally {
    deferredPrompt.value = null
  }
}

function dismiss(): void {
  dismissed.value = true
  writeDismissed()
}
</script>

<template>
  <aside v-if="variant" data-test="install-prompt" role="note">
    <template v-if="variant === 'ios'">
      <p>
        Поставьте приложение на домашний экран: нажмите «Поделиться» внизу экрана
        и выберите На экран «Домой».
      </p>
    </template>
    <template v-else>
      <p>Поставьте приложение на домашний экран для быстрого доступа.</p>
      <button type="button" data-test="install-button" @click="install">
        Установить
      </button>
    </template>
    <button type="button" data-test="dismiss-install" @click="dismiss">
      Не сейчас
    </button>
  </aside>
</template>

<style scoped>
aside { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: #edf1f6; border-top: 1px solid #8b96a6; }
p { margin: 0; flex: 1 1 auto; min-width: 0; }
button { font: inherit; padding: 0.5rem 0.9rem; border: 1px solid #8b96a6; border-radius: 0.3rem; background: #fff; }
</style>
