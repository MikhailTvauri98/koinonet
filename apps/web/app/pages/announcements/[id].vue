<script setup lang="ts">
import type { Announcement } from '~/utils/announcements'
import { apiErrorMessage } from '~/utils/apiError'
import AnnouncementEditor from '~/components/announcements/AnnouncementEditor.vue'
import MarkdownBody from '~/components/announcements/MarkdownBody.vue'
import AttachmentList from '~/components/announcements/AttachmentList.vue'
const api = useApi(), route = useRoute(), auth = useAuthStore()
const { can, canIn } = useCan()
const { formatDateTime } = useChurchDate()
const item = ref<Announcement | null>(null)
const errorMessage = ref(''), actionError = ref('')
const editing = ref(false), confirming = ref(false), busy = ref(false)
let version = 0
const editable = computed(() => {
  if (!item.value || item.value.archived) return false
  return (auth.user?.id != null && item.value.author?.id === auth.user.id)
    || (item.value.scope === 'church' ? can('announcements.church.publish') : !!item.value.ministry && canIn(item.value.ministry.id, 'announcements.publish'))
})
async function load() {
  const current = ++version
  item.value = null; editing.value = false; confirming.value = false; errorMessage.value = ''; actionError.value = ''
  try {
    const result = await api.get<{ data: Announcement }>(`/announcements/${encodeURIComponent(String(route.params.id))}`)
    if (current === version) item.value = result.data
  } catch (error) { if (current === version) errorMessage.value = apiErrorMessage(error, 'Не удалось загрузить объявление. Попробуйте ещё раз.') }
}
async function act(action: 'pin' | 'unpin' | 'archive') {
  if (!editable.value || !item.value || busy.value) return
  const current = version
  busy.value = true; actionError.value = ''
  try {
    const result = await api.post<{ data: Announcement }>(`/announcements/${encodeURIComponent(item.value.id)}/${action}`)
    if (version === current) { item.value = result.data; confirming.value = false }
  } catch (error) { if (version === current) actionError.value = apiErrorMessage(error, 'Не удалось изменить объявление. Попробуйте ещё раз.') }
  finally { busy.value = false }
}
watch(() => route.params.id, () => { void load() })
watch(editable, allowed => { if (!allowed) { editing.value = false; confirming.value = false } })
onBeforeUnmount(() => { version++ })
await load()
</script>

<template>
  <div>
    <NuxtLink to="/announcements">Объявления</NuxtLink>
    <p v-if="errorMessage" role="alert">{{ errorMessage }} <button @click="load">Повторить</button></p>
    <template v-if="item">
      <h1>{{ item.title }}</h1>
      <p v-if="item.archived">В архиве</p>
      <p v-if="item.pinned">Закреплено</p>
      <p>{{ item.ministry?.name ?? 'Церковь' }} · {{ formatDateTime(item.published_at) }} · {{ item.author?.full_name ?? 'Удалённый человек' }}</p>
      <p v-if="item.hide_after">Скрыть после: {{ item.hide_after.split('-').reverse().join('.') }}</p>
      <MarkdownBody :body="item.body" />
      <AttachmentList :attachments="item.attachments" />
      <p v-if="item.views_count !== undefined" data-test="views">Просмотров: {{ item.views_count }}</p>
      <template v-if="editable">
        <button data-test="edit" :disabled="busy" @click="editing = !editing">Изменить</button>
        <button data-test="pin" :disabled="busy" @click="act(item.pinned ? 'unpin' : 'pin')">{{ item.pinned ? 'Открепить' : 'Закрепить' }}</button>
        <button data-test="archive" :disabled="busy" @click="confirming = true">Архивировать</button>
        <div v-if="confirming" role="alertdialog" aria-label="Архивация объявления">
          <p>Архивировать объявление?</p><button data-test="confirm-archive" :disabled="busy" @click="act('archive')">Архивировать</button><button :disabled="busy" @click="confirming = false">Отмена</button>
        </div>
        <AnnouncementEditor v-if="editing" :key="item.id" :scope="item.scope" :ministry-id="item.ministry?.id" :announcement="item" @saved="item = $event; editing = false" @cancel="editing = false" />
      </template>
      <p v-if="actionError" role="alert">{{ actionError }}</p>
    </template>
  </div>
</template>
