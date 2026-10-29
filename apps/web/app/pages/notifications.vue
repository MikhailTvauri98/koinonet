<script setup lang="ts">
import type { AppNotification } from '~/stores/notifications'
import NotificationList from '~/components/notifications/NotificationList.vue'
import { apiErrorMessage } from '~/utils/apiError'

const notifications = useNotificationsStore()
const router = useRouter()
const actionError = ref('')
let failedReset = true

async function load(reset = true) {
  failedReset = reset
  await notifications.fetch(reset)
}

async function select(notification: AppNotification) {
  actionError.value = ''
  try {
    if (!notification.read_at) await notifications.markRead([notification.id])
    await router.push(notification.url)
  } catch (error) {
    actionError.value = apiErrorMessage(error, 'Не удалось отметить уведомления прочитанными. Попробуйте ещё раз.')
  }
}

async function markAll() {
  actionError.value = ''
  try { await notifications.markAllRead() }
  catch (error) { actionError.value = apiErrorMessage(error, 'Не удалось отметить уведомления прочитанными. Попробуйте ещё раз.') }
}

await load()
</script>

<template>
  <section class="notifications-page">
    <h1>Уведомления</h1>
    <NuxtLink to="/settings/notifications">Настройки уведомлений</NuxtLink>
    <button v-if="notifications.unreadCount" type="button" data-test="mark-all-read" :disabled="notifications.marking" @click="markAll">Отметить всё прочитанным</button>
    <p v-if="actionError" role="alert">{{ actionError }}</p>
    <p v-if="notifications.loading" role="status">Загрузка…</p>
    <NotificationList :items="notifications.items" :disabled="notifications.marking" @select="select" />
    <p v-if="notifications.error" role="alert">{{ notifications.error }} <button type="button" data-test="retry" :disabled="notifications.loading" @click="load(failedReset)">Повторить</button></p>
    <p v-else-if="!notifications.loading && !notifications.items.length">Уведомлений пока нет</p>
    <button v-if="notifications.nextCursor" type="button" data-test="load-more" :disabled="notifications.loading" @click="load(false)">Показать ещё</button>
  </section>
</template>

<style scoped>
.notifications-page { max-width: 42rem; margin: 0 auto; color: #202b3a; overflow-wrap: anywhere; }
button { margin: 0.5rem; font: inherit; padding: 0.5rem 0.9rem; border: 1px solid #8b96a6; border-radius: 0.3rem; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: wait; }
[role='alert'] { color: #a32020; }
</style>
