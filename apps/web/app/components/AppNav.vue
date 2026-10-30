<script setup lang="ts">
const { can } = useCan()
const notifications = useNotificationsStore()
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
  list.push({ to: '/notifications', label: 'Уведомления' })
  list.push({ to: '/settings/profile', label: 'Профиль' })

  return list
})
</script>

<template>
  <nav class="app-nav" aria-label="Основная навигация">
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="app-nav__item"
      active-class="app-nav__item--active"
    >
      {{ item.label }}
      <span v-if="item.to === '/notifications' && notifications.unreadCount" class="app-nav__badge" data-test="notification-badge" :aria-label="`Непрочитанных: ${notifications.unreadCount}`">{{ notifications.unreadCount }}</span>
    </NuxtLink>
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
  gap: 0.5rem;
}

.app-nav__item {
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  text-decoration: none;
  color: inherit;
}

.app-nav__item--active {
  font-weight: 600;
}
.app-nav__badge { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 999px; background: #234e79; color: white; font-size: 0.85em; }

.app-nav__admin {
  display: flex;
  gap: inherit;
  flex-direction: inherit;
}

/* Телефон: нижняя панель вкладок. Семь разделов администратора в ширину
   телефона не помещаются: панель прокручивается вбок, а не обрезает
   «Роли», «Настройки церкви» и «Журнал» за краем экрана. Пока разделов
   немного, они делят ширину поровну. */
@media (max-width: 767px) {
  .app-nav {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    overflow-x: auto;
    padding: 0.5rem;
    border-top: 1px solid var(--border-color, #ddd);
    background: var(--surface-color, #fff);
  }

  .app-nav__item,
  .app-nav__admin {
    flex: 1 0 auto;
  }

  .app-nav__item {
    white-space: nowrap;
    text-align: center;
  }
}

/* Десктоп: боковая панель. */
@media (min-width: 768px) {
  .app-nav {
    flex-direction: column;
    align-items: stretch;
    padding: 1rem;
    border-right: 1px solid var(--border-color, #ddd);
    min-height: 100vh;
  }
}
</style>
