<script setup lang="ts">
import { hasCalendarManagement } from '~/utils/templates'
const auth = useAuthStore()
const settings = useSettingsStore()
const canManageCalendar = computed(() => hasCalendarManagement(auth.permissions))
const { can } = useCan()
const notifications = useNotificationsStore()
const chats = useChatsStore()
// Правило и обоснование — в useCan.ts (hasVisibleMinistries), общее с index.vue.
const hasMinistries = useHasVisibleMinistries()

interface NavItem {
  to: string
  label: string
}

// Раздел администрирования виден тому, у кого есть хотя бы один пункт в нём
// (задача 29 добавила «Роли» тем же приёмом; задача 30 — «Настройки церкви»
// и «Журнал», docs/architecture.md, раздел 10). `nav-admin` — сама секция,
// а не один из пунктов: тест на скрытие/показ (profile.spec.ts) проверяет
// именно её.
const adminItems = computed<NavItem[]>(() => {
  const list: NavItem[] = []

  if (can('roles.manage_global')) {
    list.push({ to: '/admin/roles', label: 'Роли' })
  }

  if (can('settings.manage')) {
    list.push({ to: '/admin/settings', label: 'Настройки церкви' })
  }

  if (can('audit.view')) {
    list.push({ to: '/admin/audit', label: 'Журнал' })
  }

  return list
})

const items = computed<NavItem[]>(() => {
  const list: NavItem[] = [{ to: '/', label: 'Главная' }]

  if (can('people.view')) {
    list.push({ to: '/people', label: 'Люди' })
  }

  if (hasMinistries.value) {
    list.push({ to: '/ministries', label: 'Служения' })
  }

  list.push({ to: '/calendar', label: 'Календарь' })
  list.push({ to: '/announcements', label: 'Объявления' })
  list.push({ to: '/chats', label: 'Чаты' })
  list.push({ to: '/notifications', label: 'Уведомления' })
  list.push({ to: '/settings/profile', label: 'Профиль' })

  return list
})
</script>

<template>
  <nav class="app-nav" aria-label="Основная навигация">
    <div class="app-nav__brand">
      <span class="app-nav__mark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v5m-2-3h4M5 21V11l7-4 7 4v10H5Zm5 0v-6h4v6" />
        </svg>
      </span>
      <span>{{ settings.churchName || 'Церковь' }}</span>
    </div>
    <template v-for="item in items" :key="item.to">
      <NuxtLink
        :to="item.to"
        class="app-nav__item"
        active-class="app-nav__item--active"
      >
        {{ item.label }}
        <span v-if="item.to === '/chats' && chats.unreadTotal" class="app-nav__badge" data-test="chat-badge" :aria-label="`Непрочитанных: ${chats.unreadTotal}`">{{ chats.unreadTotal }}</span>
        <span v-if="item.to === '/notifications' && notifications.unreadCount" class="app-nav__badge" data-test="notification-badge" :aria-label="`Непрочитанных: ${notifications.unreadCount}`">{{ notifications.unreadCount }}</span>
      </NuxtLink>
      <NuxtLink v-if="item.to === '/calendar' && canManageCalendar" to="/templates" class="app-nav__item app-nav__subitem" active-class="app-nav__item--active">Шаблоны</NuxtLink>
    </template>
    <div v-if="adminItems.length" data-test="nav-admin" class="app-nav__admin">
      <NuxtLink
        v-for="item in adminItems"
        :key="item.to"
        :to="item.to"
        class="app-nav__item"
        active-class="app-nav__item--active"
      >
        {{ item.label }}
      </NuxtLink>
    </div>
  </nav>
</template>

<style scoped>
.app-nav {
  display: flex;
  gap: var(--ui-space-1);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
}

.app-nav__brand {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-2) var(--ui-space-6);
  color: var(--ui-text);
  font-weight: 650;
  overflow-wrap: anywhere;
}

.app-nav__mark {
  display: grid;
  place-items: center;
  flex: 0 0 2.5rem;
  height: 2.5rem;
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  border-radius: var(--ui-radius-md);
}

.app-nav__item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-height: var(--ui-control-height);
  padding: 0.625rem 0.875rem;
  border-radius: var(--ui-radius-sm);
  text-decoration: none;
  color: inherit;
  font-size: 0.9375rem;
}

.app-nav__item:hover {
  background: var(--ui-surface-muted);
  color: var(--ui-accent);
}

.app-nav__item--active {
  font-weight: 600;
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
}
.app-nav__subitem { font-size: .875rem; }
.app-nav__badge { display: inline-block; margin-left: auto; padding: 0.1rem 0.4rem; border-radius: 999px; background: var(--ui-accent); color: white; font-size: 0.85em; }

.app-nav__admin {
  display: flex;
  gap: inherit;
  flex-direction: inherit;
}

/* Состав и горизонтальная лента сохраняются до задачи 5 фазы дизайна. */
@media (max-width: 767px) {
  .app-nav {
    position: fixed;
    z-index: 10;
    inset-inline: 0;
    bottom: 0;
    overflow-x: auto;
    padding: var(--ui-space-2);
    padding-bottom: calc(var(--ui-space-2) + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--ui-border);
  }

  .app-nav__brand { display: none; }
  .app-nav__item,
  .app-nav__admin {
    flex: 1 0 auto;
  }

  .app-nav__item {
    white-space: nowrap;
    text-align: center;
    justify-content: center;
  }
}

/* Десктоп: боковая панель. */
@media (min-width: 768px) {
  .app-nav {
    position: sticky;
    top: 0;
    align-self: flex-start;
    flex: 0 0 var(--ui-sidebar-width);
    width: var(--ui-sidebar-width);
    height: 100vh;
    height: 100dvh;
    overflow-y: auto;
    flex-direction: column;
    align-items: stretch;
    padding: var(--ui-space-4);
    border-right: 1px solid var(--ui-border);
  }
  .app-nav__item { flex-shrink: 0; }
  .app-nav__admin { margin-top: var(--ui-space-4); padding-top: var(--ui-space-4); border-top: 1px solid var(--ui-border); }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .app-nav { flex-basis: 12rem; width: 12rem; padding: var(--ui-space-3); }
}
</style>
