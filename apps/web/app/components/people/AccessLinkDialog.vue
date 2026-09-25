<script setup lang="ts">
import QRCode from 'qrcode'

const props = defineProps<{ url: string, kind: 'invite' | 'password_reset' }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const qr = ref('')
const qrError = ref('')
const copyMessage = ref('')
let active = true

onMounted(async () => {
  dialog.value?.showModal()
  try {
    const svg = await QRCode.toString(props.url, { type: 'svg', margin: 4, width: 256 })
    if (active) qr.value = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  } catch {
    if (active) qrError.value = 'Не удалось построить QR-код. Передайте ссылку текстом.'
  }
})
onBeforeUnmount(() => { active = false })

async function copy() {
  try {
    await navigator.clipboard.writeText(props.url)
    if (active) copyMessage.value = 'Скопировано'
  } catch {
    if (active) copyMessage.value = 'Скопируйте ссылку вручную.'
  }
}

function close() {
  dialog.value?.close()
  emit('close')
}
</script>

<template>
  <dialog ref="dialog" aria-labelledby="access-link-title" @cancel.prevent="close">
    <h2 id="access-link-title">{{ kind === 'invite' ? 'Приглашение' : 'Ссылка сброса пароля' }}</h2>
    <p>Скопируйте ссылку сейчас. После закрытия окна она больше не показывается.</p>
    <p>{{ kind === 'invite' ? 'Ссылка действует 7 суток.' : 'Ссылка действует 24 часа.' }}</p>
    <p class="access-link" data-test="invite-link">{{ url }}</p>
    <img v-if="qr" :src="qr" width="256" height="256" alt="QR-код ссылки" data-test="link-qr">
    <p v-if="qrError" role="alert">{{ qrError }}</p>
    <p v-if="copyMessage" role="status">{{ copyMessage }}</p>
    <div class="actions">
      <button type="button" data-test="copy-invite-link" @click="copy">Копировать ссылку</button>
      <button type="button" data-test="close-link" autofocus @click="close">Закрыть</button>
    </div>
  </dialog>
</template>

<style scoped>
dialog { width: min(30rem, calc(100% - 4rem)); border: 1px solid #8b96a6; border-radius: 0.5rem; padding: 1.5rem; }
dialog::backdrop { background: #17213399; }
.access-link { overflow-wrap: anywhere; user-select: all; padding: 0.75rem; background: #edf1f6; }
img { display: block; margin: 1rem auto; max-width: 100%; height: auto; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
button { font: inherit; padding: 0.65rem; cursor: pointer; }
</style>
