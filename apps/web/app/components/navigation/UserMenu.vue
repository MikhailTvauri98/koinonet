<script setup lang="ts">
import UiDialog from '~/components/ui/UiDialog.vue'
import { apiErrorMessage } from '~/utils/apiError'

const emit = defineEmits<{ close: [] }>()
const auth = useAuthStore()
const route = useRoute()
const loggingOut = ref(false)
const error = ref('')
let active = true
onBeforeUnmount(() => { active = false })
const links = [
  { to: '/settings/profile', label: 'Профиль' },
  { to: '/settings/appearance', label: 'Оформление' },
  { to: '/settings/ical', label: 'Календарь телефона' },
]
const isActive = (to: string) => route.path === to

// Выход идёт тем же потоком, что и в профиле: стор чистится только после ответа
// сервера, ошибка остаётся у действия.
async function logout() {
  if (loggingOut.value) return
  const session = auth.sessionVersion
  const current = () => active && session === auth.sessionVersion
  loggingOut.value = true
  error.value = ''
  try {
    await auth.logout()
    // Сброс стора убирает блок пользователя вместе с меню, поэтому переход не зависит от монтирования.
    if (!auth.user && auth.sessionVersion === session + 1) await navigateTo('/login')
  } catch (failure) {
    if (current()) error.value = apiErrorMessage(failure, 'Не удалось выйти. Попробуйте ещё раз.')
  } finally {
    if (current()) loggingOut.value = false
  }
}
</script>

<template>
  <UiDialog :open="true" label="Меню пользователя" @close="emit('close')">
    <div class="user-menu">
      <NuxtLink v-for="item in links" :key="item.to" :to="item.to" class="user-menu__item" :class="{ 'user-menu__item--active': isActive(item.to) }" :aria-current="isActive(item.to) ? 'page' : undefined" active-class="" exact-active-class="" @click="emit('close')">{{ item.label }}</NuxtLink>
      <button type="button" class="user-menu__item user-menu__logout" data-test="nav-logout" :disabled="loggingOut" @click="logout">{{ loggingOut ? 'Выходим…' : 'Выйти' }}</button>
      <p v-if="error" role="alert" class="user-menu__error">{{ error }}</p>
    </div>
    <template #actions><button type="button" class="ui-button" @click="emit('close')">Закрыть</button></template>
  </UiDialog>
</template>

<style scoped>
.user-menu { display: flex; flex-direction: column; gap: var(--ui-space-1); }
.user-menu__item { display: flex; align-items: center; min-width: 0; min-height: var(--ui-control-height); padding: 12px; border: 0; border-radius: var(--ui-radius-sm); background: transparent; color: var(--ui-text); font: inherit; text-align: start; text-decoration: none; }
.user-menu__item:hover:not(:disabled) { background: var(--ui-surface-muted); }
.user-menu__item--active { background: var(--ui-accent-soft); color: var(--ui-accent); font-weight: 600; }
.user-menu__logout { margin-top: var(--ui-space-2); border-top: 1px solid var(--ui-border); border-radius: 0 0 var(--ui-radius-sm) var(--ui-radius-sm); }
.user-menu__error { margin: var(--ui-space-2) 0 0; color: var(--ui-danger); font-size: .875rem; }
</style>
