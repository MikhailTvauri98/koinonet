<script setup lang="ts">
import LoadingState from '~/components/ui/LoadingState.vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import type { AppNotification } from '~/stores/notifications'
import NotificationList from '~/components/notifications/NotificationList.vue'
import EnableNotificationsButton from '~/components/notifications/EnableNotificationsButton.vue'
import { apiErrorMessage } from '~/utils/apiError'

const notifications = useNotificationsStore()
const auth = useAuthStore()
const router = useRouter()
const actionError = ref('')
let failedReset = true
let active = true
onBeforeUnmount(() => { active = false })

async function load(reset = true) {
  failedReset = reset
  await notifications.fetch(reset)
}

async function select(notification: AppNotification) {
  const session = auth.sessionVersion
  actionError.value = ''
  try {
    if (!notification.read_at) await notifications.markRead([notification.id])
    if (active && session === auth.sessionVersion) await router.push(notification.url)
  } catch (error) {
    if (active && session === auth.sessionVersion) actionError.value = apiErrorMessage(error, 'Не удалось отметить уведомления прочитанными. Попробуйте ещё раз.')
  }
}

async function markAll() {
  const session = auth.sessionVersion
  actionError.value = ''
  try { await notifications.markAllRead() }
  catch (error) { if (active && session === auth.sessionVersion) actionError.value = apiErrorMessage(error, 'Не удалось отметить уведомления прочитанными. Попробуйте ещё раз.') }
}

watch(() => auth.sessionVersion, () => { actionError.value = '' })

await load()
</script>

<template>
  <section class="notifications-page">
    <h1>Уведомления</h1>
    <EnableNotificationsButton />
    <NuxtLink to="/settings/notifications">Настройки уведомлений</NuxtLink>
    <button v-if="notifications.unreadCount" type="button" data-test="mark-all-read" :disabled="notifications.marking" @click="markAll">Отметить всё прочитанным</button>
    <p v-if="actionError" role="alert">{{ actionError }}</p>
    <LoadingState v-if="notifications.loading" :label="notifications.items.length ? 'Обновляем уведомления…' : 'Загружаем уведомления…'" />
    <NotificationList :items="notifications.items" :disabled="notifications.marking" @select="select" />
    <p v-if="notifications.error" role="alert">{{ notifications.error }} <button type="button" data-test="retry" :disabled="notifications.loading" @click="load(failedReset)">Повторить</button></p>
    <EmptyState v-else-if="!notifications.loading && !notifications.items.length" title="Уведомлений пока нет" description="Здесь появятся объявления, назначения и напоминания. Категории можно выбрать в настройках уведомлений." />
    <button v-if="notifications.nextCursor" type="button" data-test="load-more" :disabled="notifications.loading" @click="load(false)">Показать ещё</button>
  </section>
</template>

<style scoped>
.notifications-page { min-width: 0; max-width: 42rem; margin: 0 auto; color: var(--ui-text); overflow-wrap: anywhere; }
button { max-width: 100%; margin-block: var(--ui-space-2); }
</style>
