<script setup lang="ts">
import { hasCalendarManagement } from '~/utils/templates'
const auth = useAuthStore()
const route = useRoute()
const emit = defineEmits<{ resize: [height: number] }>()
const navigation = ref<HTMLElement>()
const moreOpen = ref(false)
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
const primaryPaths = ['/', '/calendar', '/chats', '/notifications']
const secondaryItems = computed(() => {
  const list = items.value.filter(item => !primaryPaths.includes(item.to))
  if (canManageCalendar.value) list.splice(list.findIndex(item => item.to === '/announcements'), 0, { to: '/templates', label: 'Шаблоны' })
  return list
})
function isActive(to: string) {
  if (to === '/') return route.path === '/'
  if (to === '/settings/profile') return route.path.startsWith('/settings/')
  if (to === '/calendar' && route.path.startsWith('/events/')) return true
  return route.path === to || route.path.startsWith(to + '/')
}
const moreActive = computed(() => [...secondaryItems.value, ...adminItems.value].some(item => isActive(item.to)))
watch([() => route.fullPath, () => auth.sessionVersion, () => JSON.stringify(auth.permissions)], () => { moreOpen.value = false })

// The layout reserves the rendered height, including wrapped text and safe-area.
let observer: ResizeObserver | undefined
let desktop: MediaQueryList | undefined
function measureNavigation() {
  if (desktop?.matches) moreOpen.value = false
  emit('resize', desktop?.matches ? 0 : Math.ceil(navigation.value?.getBoundingClientRect().height ?? 0))
}
onMounted(() => {
  desktop = window.matchMedia('(min-width: 768px)')
  desktop.addEventListener('change', measureNavigation)
  observer = new ResizeObserver(measureNavigation)
  if (navigation.value) observer.observe(navigation.value, { box: 'border-box' })
  measureNavigation()
})
onBeforeUnmount(() => { observer?.disconnect(); desktop?.removeEventListener('change', measureNavigation) })
</script>

<template>
  <nav ref="navigation" class="app-nav" :class="{ 'app-nav--unread': chats.unreadTotal || notifications.unreadCount }" aria-label="Основная навигация">
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
        :class="{ 'app-nav__secondary': !primaryPaths.includes(item.to), 'app-nav__item--active': isActive(item.to) }"
        :aria-current="isActive(item.to) ? 'page' : undefined"
        active-class=""
        exact-active-class=""
      >
        <span data-nav-label>{{ item.label }}</span>
        <span v-if="item.to === '/chats' && chats.unreadTotal" class="app-nav__badge" data-test="chat-badge" :aria-label="`Непрочитанных: ${chats.unreadTotal}`">{{ chats.unreadTotal }}</span>
        <span v-if="item.to === '/notifications' && notifications.unreadCount" class="app-nav__badge" data-test="notification-badge" :aria-label="`Непрочитанных: ${notifications.unreadCount}`">{{ notifications.unreadCount }}</span>
      </NuxtLink>
      <NuxtLink v-if="item.to === '/calendar' && canManageCalendar" to="/templates" class="app-nav__item app-nav__subitem app-nav__secondary" :class="{ 'app-nav__item--active': isActive('/templates') }" :aria-current="isActive('/templates') ? 'page' : undefined" active-class="" exact-active-class="">Шаблоны</NuxtLink>
    </template>
    <div v-if="adminItems.length" data-test="nav-admin" class="app-nav__admin">
      <NuxtLink
        v-for="item in adminItems"
        :key="item.to"
        :to="item.to"
        class="app-nav__item"
        :class="{ 'app-nav__item--active': isActive(item.to) }"
        :aria-current="isActive(item.to) ? 'page' : undefined"
        active-class=""
        exact-active-class=""
      >
        {{ item.label }}
      </NuxtLink>
    </div>
    <button type="button" data-test="nav-more" class="app-nav__item app-nav__more" :class="{ 'app-nav__item--active': moreActive }" aria-haspopup="dialog" :aria-expanded="moreOpen" @click="moreOpen = true">
      <span data-nav-label>Ещё</span>
    </button>
    <NavigationMoreMenu v-if="moreOpen" :items="secondaryItems" :admin-items="adminItems" @close="moreOpen = false" />
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
  gap: min(var(--ui-space-3), 12px);
  padding: min(var(--ui-space-2), 8px) min(var(--ui-space-2), 8px) min(var(--ui-space-6), 24px);
  color: var(--ui-text);
  font-weight: 650;
  overflow-wrap: anywhere;
}

.app-nav__mark {
  display: grid;
  place-items: center;
  flex: 0 0 min(2.5rem, 40px);
  height: min(2.5rem, 40px);
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  border-radius: var(--ui-radius-md);
}

.app-nav__item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-height: var(--ui-control-height);
  padding: 0.625rem min(0.875rem, 14px);
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

.app-nav__more { display: none; }

@media (max-width: 767px) {
  .app-nav {
    position: fixed;
    z-index: 10;
    inset-inline: 0;
    bottom: 0;
    flex-wrap: wrap;
    gap: 0;
    padding: 4px;
    padding-bottom: calc(4px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--ui-border);
  }
  .app-nav__brand, .app-nav__secondary, .app-nav__admin { display: none; }
  .app-nav__item {
    position: relative;
    flex: 1 0 auto;
    min-width: 44px;
    min-height: 44px;
    padding: 8px 2px;
    border: 0;
    background: transparent;
    font-size: .8125rem;
    line-height: 1.5;
    white-space: nowrap;
    text-align: center;
    justify-content: center;
  }
  .app-nav__more { display: flex; }
  .app-nav__item--active { background: var(--ui-accent-soft); }
  .app-nav--unread .app-nav__item { padding-top: calc(.9375rem + 2px); padding-bottom: 4px; }
  .app-nav__badge {
    position: absolute;
    top: 0;
    right: 0;
    padding: 0 4px;
    font-size: .75rem;
    line-height: 1.25;
  }
}

/* Десктоп: боковая панель. */
@media (min-width: 768px) {
  .app-nav {
    position: sticky;
    top: 0;
    align-self: flex-start;
    flex: 0 0 min(var(--ui-sidebar-width), 280px);
    width: min(var(--ui-sidebar-width), 280px);
    height: 100vh;
    height: 100dvh;
    overflow-y: auto;
    flex-direction: column;
    align-items: stretch;
    padding: min(var(--ui-space-4), 16px);
    border-right: 1px solid var(--ui-border);
  }
  .app-nav__item { flex-shrink: 0; }
  .app-nav__admin { margin-top: var(--ui-space-4); padding-top: var(--ui-space-4); border-top: 1px solid var(--ui-border); }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .app-nav { flex-basis: min(12rem, 280px); width: min(12rem, 280px); padding: min(var(--ui-space-3), 12px); }
}
</style>
