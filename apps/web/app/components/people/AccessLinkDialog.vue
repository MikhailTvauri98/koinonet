<script setup lang="ts">
import QRCode from 'qrcode'
import UiDialog from '~/components/ui/UiDialog.vue'

const props = defineProps<{ url: string, kind: 'invite' | 'password_reset' }>()
const emit = defineEmits<{ close: [] }>()
const qr = ref('')
const qrError = ref('')
const copyMessage = ref('')
const open = ref(true)
let active = true
let generation = 0

watch(() => [props.url, props.kind], async () => {
  const version = ++generation
  qr.value = ''; qrError.value = ''; copyMessage.value = ''
  try {
    const svg = await QRCode.toString(props.url, { type: 'svg', margin: 4, width: 256 })
    if (active && open.value && version === generation) qr.value = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  } catch {
    if (active && open.value && version === generation) qrError.value = 'Не удалось построить QR-код. Передайте ссылку текстом.'
  }
}, { immediate: true })
onBeforeUnmount(() => { active = false; generation++; qr.value = ''; copyMessage.value = '' })
async function copy() {
  const version = generation
  try {
    await navigator.clipboard.writeText(props.url)
    if (active && open.value && version === generation) copyMessage.value = 'Скопировано'
  } catch {
    if (active && open.value && version === generation) copyMessage.value = 'Скопируйте ссылку вручную.'
  }
}
function close() {
  open.value = false; generation++; qr.value = ''; copyMessage.value = ''
  emit('close')
}
</script>

<template>
  <UiDialog :open="open" :label="kind === 'invite' ? 'Приглашение' : 'Ссылка сброса пароля'" @close="close">
    <div class="ui-dialog-header">
      <h2>{{ kind === 'invite' ? 'Приглашение' : 'Ссылка сброса пароля' }}</h2>
      <button type="button" class="ui-button" aria-label="Закрыть окно" @click="close">×</button>
    </div>
    <p>Скопируйте ссылку сейчас. После закрытия окна она больше не показывается.</p>
    <p class="access-link__hint">{{ kind === 'invite' ? 'Ссылка действует 7 суток.' : 'Ссылка действует 24 часа.' }}</p>
    <p v-if="open" class="access-link" data-test="invite-link">{{ url }}</p>
    <img v-if="qr" :src="qr" width="256" height="256" alt="QR-код ссылки" data-test="link-qr">
    <p v-if="qrError" role="alert">{{ qrError }}</p>
    <p v-if="copyMessage" role="status">{{ copyMessage }}</p>
    <template #actions>
      <button type="button" class="ui-button" data-test="close-link" @click="close">Закрыть</button>
      <button type="button" class="ui-button ui-button--primary" data-test="copy-invite-link" @click="copy">Копировать ссылку</button>
    </template>
  </UiDialog>
</template>

<style scoped>
.access-link { overflow-wrap: anywhere; user-select: all; padding: var(--ui-space-3); background: var(--ui-surface-muted); border: 1px solid var(--ui-border); border-radius: 8px; }
.access-link__hint { color: var(--ui-text-muted); font-size: .875rem; }
img { display: block; margin: var(--ui-space-4) auto; max-width: 100%; height: auto; border-radius: 8px; }
[role='alert'] { color: var(--ui-danger); }
</style>
