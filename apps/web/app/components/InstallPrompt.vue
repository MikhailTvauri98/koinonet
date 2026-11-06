<script setup lang="ts">
// Подсказка установки PWA на домашний экран (CONTEXT.md, «Подсказка
// установки»). На iOS Safari нет `beforeinstallprompt` — там показываем
// инструкцию «Поделиться → На экран „Домой“». На Android/Chrome перехватываем
// `beforeinstallprompt` и предлагаем установку кнопкой, которая вызывает
// стандартный диалог браузера. Уже установленному приложению (standalone)
// подсказка не показывается вовсе, отказ от неё запоминается в localStorage.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { usePlatform } from '~/composables/usePlatform'

// Ключ в localStorage: свой, не завязанный на @vite-pwa/nuxt — его
// собственный клиентский плагин (и вместе с ним `vite-pwa:hide-install`)
// выключен целиком через client.registerPlugin: false в nuxt.config.ts (см.
// комментарий там же и отчёт задачи 31 — виртуальный модуль плагина ломает
// компонентные тесты).
const DISMISS_KEY = 'install-prompt:dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void | Promise<void>
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

const platform = usePlatform()
const dismissed = ref(readDismissed())
const standalone = ref(platform.isStandalone)
const iosSafari = ref(platform.isIosSafari)
const busy = ref(false)
const installError = ref('')
let active = true
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
  active = false
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
  if (!event || busy.value) return
  busy.value = true
  installError.value = ''
  try {
    await event.prompt()
    await event.userChoice
    if (active && deferredPrompt.value === event) deferredPrompt.value = null
  } catch {
    if (active) installError.value = 'Не удалось открыть подсказку установки. Попробуйте ещё раз.'
  } finally { if (active) busy.value = false }
}

function dismiss(): void {
  dismissed.value = true
  writeDismissed()
}
</script>

<template>
  <aside v-if="variant" data-test="install-prompt" role="note" aria-label="Приложение на домашнем экране">
    <div class="install-prompt__content">
      <strong>Приложение на домашнем экране</strong>
      <p v-if="variant === 'ios'">Поставьте приложение на домашний экран: нажмите «Поделиться» внизу экрана и выберите На экран «Домой».</p>
      <p v-else>Поставьте приложение на домашний экран для быстрого доступа.</p>
      <p v-if="installError" role="alert">{{ installError }}</p>
    </div>
    <div class="install-prompt__actions">
      <button v-if="variant === 'android'" type="button" class="ui-button ui-button--primary" data-test="install-button" :disabled="busy" @click="install">{{ busy ? 'Открываем…' : 'Установить' }}</button>
      <button type="button" class="ui-button" data-test="dismiss-install" @click="dismiss">Не сейчас</button>
    </div>
  </aside>
</template>

<style scoped>
aside { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-4); padding: var(--ui-space-4) clamp(16px, 3vw, 32px); border-bottom: 1px solid var(--ui-border); background: var(--ui-surface); color: var(--ui-text); overflow-wrap: anywhere; }
.install-prompt__content { flex: 1 1 24rem; min-width: 0; }
strong { font-weight: 600; }
p { margin: var(--ui-space-2) 0 0; color: var(--ui-text-muted); font-size: .875rem; }
p[role='alert'] { color: var(--ui-danger); }
.install-prompt__actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); max-width: 100%; }
</style>
