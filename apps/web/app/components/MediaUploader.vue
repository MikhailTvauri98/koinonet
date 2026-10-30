<script setup lang="ts" generic="P extends DirectLinkPurpose | 'announcement' | 'event' | 'message'">
import type { DirectLinkPurpose, DirectLinkResources, MediaLike } from '~/utils/media'
import { apiErrorMessage } from '~/utils/apiError'

// Опрос статуса раз в секунду, всего не дольше 15 секунд (docs/architecture.md,
// раздел 7.8): `POST /media` возвращает `processing` для изображений сразу же,
// обработка (снятие EXIF, миниатюры) идёт в очереди отдельно, а привязать
// можно только файл в `ready` (иначе сервер отвечает `media.not_ready`).
const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 15_000

// Один загрузчик на все прямые ссылки на медиафайл (фото человека, обложка
// служения): загрузить → дождаться `ready` → `PUT target { media_id }`. Ответ
// цели — обновлённый ресурс, его тип следует из назначения файла
// (`DirectLinkResources`); экран сам решает, что из него взять, не
// перечитывая себя целиком.
const props = defineProps<{
  purpose: P
  // Эндпоинт привязки, принимающий `{ media_id }`.
  target?: string
  multiple?: boolean
  mediaIds?: string[]
  // Подпись кнопки выбора файла: «Выбрать фото», «Изменить обложку».
  label: string
  disabled?: boolean
  // Почему выбор файла недоступен — подсказка на выключенной кнопке.
  disabledReason?: string
}>()
const emit = defineEmits<{
  attached: [resource: DirectLinkResources[P & DirectLinkPurpose]]
  'update:mediaIds': [ids: string[]]
  busy: [value: boolean]
  error: [message: string]
}>()

type Phase = 'idle' | 'uploading' | 'processing' | 'attaching' | 'failed'

const api = useApi()
const phase = ref<Phase>('idle')
const errorMessage = ref('')
// Номер текущего запуска загрузки. Новый выбор файла, отказ, истечение
// срока и уход с экрана увеличивают его, и все ответы старого запуска —
// опрос статуса, привязка — дальше ничего не делают: файл не привязывается
// после таймаута, после ухода с экрана и дважды.
let run = 0
let pollTimer: ReturnType<typeof setTimeout> | null = null
let deadlineTimer: ReturnType<typeof setTimeout> | null = null
let queue: File[] = []
let readyIds: string[] = []
const previews = ref<{ name: string, url: string | null, id?: string }[]>([])
let currentPreview: { name: string, url: string | null, id?: string } | undefined
function removePreview(index: number) {
  const file = previews.value[index]
  if (!file || busy.value) return
  if (file.url) URL.revokeObjectURL(file.url)
  previews.value.splice(index, 1)
  readyIds = (props.mediaIds ?? readyIds).filter(id => id !== file.id)
  emit('update:mediaIds', [...readyIds])
}

function stopTimers() {
  if (pollTimer !== null) clearTimeout(pollTimer)
  if (deadlineTimer !== null) clearTimeout(deadlineTimer)
  pollTimer = null
  deadlineTimer = null
}

function fail(token: number, message: string) {
  if (token !== run) return
  run++
  stopTimers()
  phase.value = 'failed'
  queue = []
  errorMessage.value = message
  emit('error', message)
}

async function attach(token: number, mediaId: string) {
  stopTimers()
  if ((props.purpose === 'announcement' || props.purpose === 'event' || props.purpose === 'message')) {
    if (props.purpose === 'message' && currentPreview) currentPreview.id = mediaId
    readyIds = [...readyIds, mediaId]
    emit('update:mediaIds', [...readyIds])
    const next = queue.shift()
    if (next) return upload(next, true)
    phase.value = 'idle'
    return
  }
  if (!props.target) return fail(token, 'Не указано назначение файла.')
  phase.value = 'attaching'
  try {
    const response = await api.put<{ data: DirectLinkResources[P & DirectLinkPurpose] }>(props.target, { media_id: mediaId })
    if (token !== run) return
    phase.value = 'idle'
    errorMessage.value = ''
    emit('attached', response.data)
  } catch (error) {
    fail(token, apiErrorMessage(error, 'Не удалось сохранить файл. Попробуйте ещё раз.'))
  }
}

function follow(token: number, media: MediaLike) {
  if (media.status === 'ready') return attach(token, media.id)
  if (media.status === 'failed') return fail(token, 'Не удалось обработать файл. Попробуйте другой.')
  // Следующий вопрос — только после ответа на предыдущий: при медленной сети
  // опросы не накладываются друг на друга.
  pollTimer = setTimeout(() => { void poll(token, media.id) }, POLL_INTERVAL_MS)
}

async function poll(token: number, mediaId: string) {
  pollTimer = null
  let media: MediaLike
  try {
    media = (await api.get<{ data: MediaLike }>(`/media/${mediaId}/status`)).data
  } catch (error) {
    fail(token, apiErrorMessage(error, 'Не удалось узнать статус файла. Попробуйте ещё раз.'))
    return
  }
  if (token !== run) return
  await follow(token, media)
}

async function upload(file: File, continuing = false) {
  if (!continuing) readyIds = [...(props.mediaIds ?? [])]
  if (props.purpose === 'message') {
    previews.value.push({ name: file.name, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })
    currentPreview = previews.value.at(-1)
  }
  const token = ++run
  stopTimers()
  errorMessage.value = ''
  emit('error', '')
  phase.value = 'uploading'

  const body = new FormData()
  body.append('file', file)
  body.append('purpose', props.purpose)

  let media: MediaLike
  try {
    media = (await api.post<{ data: MediaLike }>('/media', body)).data
  } catch (error) {
    fail(token, apiErrorMessage(error, 'Не удалось загрузить файл. Попробуйте ещё раз.'))
    return
  }
  if (token !== run) return

  if (media.status !== 'ready' && media.status !== 'failed') {
    phase.value = 'processing'
    // Срок считается от начала обработки и не зависит от того, ответил ли
    // очередной опрос: зависший запрос не растягивает ожидание.
    deadlineTimer = setTimeout(() => {
      fail(token, 'Обработка файла заняла слишком много времени. Попробуйте ещё раз.')
    }, POLL_TIMEOUT_MS)
  }
  await follow(token, media)
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  const file = files.shift()
  input.value = ''
  queue = props.multiple && (props.purpose === 'announcement' || props.purpose === 'event' || props.purpose === 'message') ? files : []
  if (file) void upload(file)
}

const busy = computed(() => phase.value === 'uploading' || phase.value === 'processing' || phase.value === 'attaching')
watch(busy, value => emit('busy', value), { flush: 'sync' })
const statusLabel = computed(() => {
  if (phase.value === 'processing') return 'Обрабатывается…'
  if (phase.value === 'uploading' || phase.value === 'attaching') return 'Загружается…'
  return props.label
})

onBeforeUnmount(() => {
  run++
  stopTimers()
  previews.value.forEach(file => { if (file.url) URL.revokeObjectURL(file.url) })
})

// Тесты компонента вызывают загрузку напрямую через `uploader.vm.upload(file)`,
// минуя `<input type="file">`.
defineExpose({ upload })
</script>

<template>
  <div class="media-uploader">
    <label
      class="media-uploader__button" :class="{ 'media-uploader__button--disabled': busy || disabled }"
      :title="disabled ? disabledReason : undefined"
    >
      <input type="file" :accept="(purpose === 'announcement' || purpose === 'event' || purpose === 'message') ? undefined : 'image/*'" :multiple="multiple && (purpose === 'announcement' || purpose === 'event' || purpose === 'message')" data-test="file-input" :disabled="busy || disabled" @change="onFileChange">
      <span>{{ statusLabel }}</span>
    </label>
    <p v-if="errorMessage" role="alert" data-test="media-error">{{ errorMessage }}</p>
    <ul v-if="purpose === 'message'" class="previews" aria-label="Выбранные вложения">
      <li v-for="(file, index) in previews" :key="index">
        <img v-if="file.url" :src="file.url" :alt="file.name" width="72" height="72">
        <span>{{ file.name }}{{ file.id ? '' : ' (не загружено)' }}</span>
        <button type="button" :disabled="busy || disabled" :aria-label="`Убрать ${file.name}`" @click="removePreview(index)">×</button>
      </li>
    </ul>
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
.media-uploader__button--disabled { opacity: 0.6; cursor: default; }
.media-uploader__button input { display: none; }
[role='alert'] { color: #a32020; }
.previews { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: .4rem; }
.previews li { display: flex; flex-direction: column; align-items: center; max-width: 140px; overflow-wrap: anywhere; }
.previews img { object-fit: cover; }
</style>
