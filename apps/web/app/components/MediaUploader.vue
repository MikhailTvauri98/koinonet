<script setup lang="ts">
import type { MediaLike, MediaPurpose } from '~/utils/media'
import { apiErrorMessage } from '~/utils/apiError'

// Опрос раз в секунду до 15 секунд (docs/architecture.md, раздел 7.8;
// бриф задачи 30): `POST /media` возвращает `processing` для изображений
// сразу же, обработка (снятие EXIF, миниатюры) идёт в очереди отдельно.
const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 15_000

const props = defineProps<{
  purpose: MediaPurpose
  target: string
}>()
const emit = defineEmits<{
  // photo_url из ответа `target` (PersonResource у `/me/photo` и `/people/{id}/photo`,
  // где формат совпадает — раздел 6.4: "фото человека тем, у кого people.view"):
  // компонент-потребитель сам решает, что делать с новым адресом фото, не
  // перечитывая профиль целиком.
  uploaded: [photoUrl: string | null]
}>()

type Phase = 'idle' | 'uploading' | 'processing' | 'attaching' | 'failed'

const api = useApi()
const phase = ref<Phase>('idle')
const errorMessage = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null
let elapsedMs = 0

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function fail(message: string) {
  stopPolling()
  phase.value = 'failed'
  errorMessage.value = message
}

async function attach(mediaId: string) {
  phase.value = 'attaching'
  try {
    const response = await api.put<{ data: { photo_url?: string | null } }>(props.target, { media_id: mediaId })
    phase.value = 'idle'
    errorMessage.value = ''
    emit('uploaded', response.data.photo_url ?? null)
  } catch (error) {
    fail(apiErrorMessage(error, 'Не удалось сохранить файл. Попробуйте ещё раз.'))
  }
}

async function poll(mediaId: string) {
  elapsedMs += POLL_INTERVAL_MS

  let media: MediaLike
  try {
    const response = await api.get<{ data: MediaLike }>(`/media/${mediaId}/status`)
    media = response.data
  } catch {
    fail('Не удалось узнать статус файла. Попробуйте ещё раз.')
    return
  }

  if (media.status === 'ready') {
    stopPolling()
    await attach(media.id)
    return
  }

  if (media.status === 'failed') {
    fail('Не удалось обработать файл. Попробуйте другой.')
    return
  }

  if (elapsedMs >= POLL_TIMEOUT_MS) {
    fail('Обработка файла заняла слишком много времени. Попробуйте ещё раз.')
  }
}

async function handleUploaded(media: MediaLike) {
  if (media.status === 'ready') {
    await attach(media.id)
    return
  }

  if (media.status === 'failed') {
    fail('Не удалось обработать файл. Попробуйте другой.')
    return
  }

  phase.value = 'processing'
  elapsedMs = 0
  pollTimer = setInterval(() => { void poll(media.id) }, POLL_INTERVAL_MS)
}

async function upload(file: File) {
  errorMessage.value = ''
  phase.value = 'uploading'

  const body = new FormData()
  body.append('file', file)
  body.append('purpose', props.purpose)

  try {
    const response = await api.post<{ data: MediaLike }>('/media', body)
    await handleUploaded(response.data)
  } catch (error) {
    fail(apiErrorMessage(error, 'Не удалось загрузить файл. Попробуйте ещё раз.'))
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''
  if (file) void upload(file)
}

const busy = computed(() => phase.value === 'uploading' || phase.value === 'processing' || phase.value === 'attaching')
const statusLabel = computed(() => {
  if (phase.value === 'processing') return 'Обрабатывается…'
  if (phase.value === 'uploading' || phase.value === 'attaching') return 'Загружается…'
  return 'Выбрать фото'
})

onBeforeUnmount(stopPolling)

// Тест компонента (tests/component/profile.spec.ts) вызывает загрузку
// напрямую через `uploader.vm.upload(file)`, минуя `<input type="file">`.
defineExpose({ upload })
</script>

<template>
  <div class="media-uploader">
    <label class="media-uploader__button">
      <input type="file" accept="image/*" data-test="file-input" :disabled="busy" @change="onFileChange">
      <span>{{ statusLabel }}</span>
    </label>
    <p v-if="errorMessage" role="alert" data-test="media-error">{{ errorMessage }}</p>
  </div>
</template>

<style scoped>
.media-uploader__button {
  display: inline-block;
  padding: 0.5rem 0.9rem;
  border: 1px solid #8b96a6;
  border-radius: 0.4rem;
  cursor: pointer;
}
.media-uploader__button input { display: none; }
[role='alert'] { color: #a32020; }
</style>
