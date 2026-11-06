<script setup lang="ts">
import PageHeader from '~/components/ui/PageHeader.vue'
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
const opening = ref(false)
let failedReset = true
let active = true
onBeforeUnmount(() => { active = false })

async function load(reset = true) {
  failedReset = reset
  await notifications.fetch(reset)
}

async function select(notification: AppNotification) {
  if (opening.value || notifications.marking) return
  const session = auth.sessionVersion
  const current = () => active && session === auth.sessionVersion
  opening.value = true
  actionError.value = ''
  try {
    try { if (!notification.read_at) await notifications.markRead([notification.id]) }
    catch (error) {
      if (current()) actionError.value = apiErrorMessage(error, 'Не удалось отметить уведомления прочитанными. Попробуйте ещё раз.')
      return
    }
    if (!current()) return
    try {
      const failure = await router.push(notification.url)
      if (failure) throw failure
    } catch {
      if (current()) actionError.value = 'Уведомление прочитано. Не удалось открыть страницу. Нажмите на уведомление, чтобы повторить переход.'
    }
  } finally { if (current()) opening.value = false }
}

async function markAll() {
  if (notifications.marking || opening.value) return
  const session = auth.sessionVersion
  actionError.value = ''
  try { await notifications.markAllRead() }
  catch (error) { if (active && session === auth.sessionVersion) actionError.value = apiErrorMessage(error, 'Не удалось отметить уведомления прочитанными. Попробуйте ещё раз.') }
}

watch(() => auth.sessionVersion, () => { actionError.value = ''; opening.value = false })

await load()
</script>

<template>
  <section class="notifications-page">
    <PageHeader title="Уведомления" description="Объявления, назначения и напоминания.">
      <template #actions><NuxtLink class="ui-button" to="/settings/notifications">Настройки уведомлений</NuxtLink></template>
    </PageHeader>
    <EnableNotificationsButton heading />
    <div v-if="notifications.items.length || notifications.marking" class="notifications-page__toolbar">
      <p role="status" data-test="notification-summary">{{ notifications.marking ? 'Отмечаем уведомления…' : notifications.unreadCount ? `Непрочитано: ${notifications.unreadCount}` : 'Все уведомления прочитаны' }}</p>
      <button v-if="notifications.unreadCount || notifications.marking" type="button" class="ui-button" data-test="mark-all-read" :disabled="notifications.marking || opening" @click="markAll">Отметить всё прочитанным</button>
    </div>
    <p v-if="actionError" role="alert" class="notifications-page__error">{{ actionError }}</p>
    <LoadingState v-if="notifications.loading" :label="notifications.items.length ? 'Обновляем уведомления…' : 'Загружаем уведомления…'" />
    <NotificationList :items="notifications.items" :disabled="notifications.marking || opening" @select="select" />
    <div v-if="notifications.error" role="alert" class="notifications-page__error notifications-page__retry">
      <p>{{ notifications.error }}</p>
      <button type="button" class="ui-button" data-test="retry" :disabled="notifications.loading" @click="load(failedReset)">Повторить</button>
    </div>
    <EmptyState v-else-if="!notifications.loading && !notifications.items.length" title="Уведомлений пока нет" description="Здесь появятся объявления, назначения и напоминания. Категории можно выбрать в настройках уведомлений." />
    <button v-if="notifications.nextCursor" type="button" class="ui-button notifications-page__more" data-test="load-more" :disabled="notifications.loading" @click="load(false)">Показать ещё</button>
  </section>
</template>

<style scoped>
.notifications-page { min-width: 0; max-width: 56rem; color: var(--ui-text); overflow-wrap: anywhere; }
.notifications-page__toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-space-3); margin-block: var(--ui-space-6) var(--ui-space-4); }
.notifications-page__toolbar p { margin: 0; font-size: .875rem; color: var(--ui-text-muted); }
.notifications-page__error { margin-block: var(--ui-space-4); color: var(--ui-danger); }
.notifications-page__retry { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-3); }
.notifications-page__retry p { flex: 1 1 20rem; margin: 0; }
.notifications-page__more { margin-top: var(--ui-space-4); }
</style>
