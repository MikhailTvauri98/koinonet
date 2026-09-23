<script setup lang="ts">
const auth = useAuthStore()
const { can } = useCan()

interface NavItem {
  to: string
  label: string
}

// "Служения" показываем тому, кому есть что там смотреть: состоит хотя бы в
// одном служении, либо видит/администрирует все служения без участия в них.
// Каталог прав (docs/architecture.md, раздел 6.1) не заводит отдельного
// "ministries.view" — список служений сам по себе не за правом, а решение
// показывать пункт меню — это решение только клиента, сервер как обычно
// остаётся единственным источником правды по каждому конкретному служению.
const hasMinistries = computed(() =>
  can('ministries.view_all') || can('ministries.manage_all') || Object.keys(auth.permissions.ministries).length > 0,
)

const items = computed<NavItem[]>(() => {
  const list: NavItem[] = [{ to: '/', label: 'Главная' }]

  if (can('people.view')) {
    list.push({ to: '/people', label: 'Люди' })
  }

  if (hasMinistries.value) {
    list.push({ to: '/ministries', label: 'Служения' })
  }

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
    </NuxtLink>
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

/* Телефон: нижняя панель вкладок. */
@media (max-width: 767px) {
  .app-nav {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    justify-content: space-around;
    padding: 0.5rem;
    border-top: 1px solid var(--border-color, #ddd);
    background: var(--surface-color, #fff);
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
