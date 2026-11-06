<script setup lang="ts">
import { hasCalendarManagement } from '~/utils/templates'
const auth = useAuthStore()
const route = useRoute()
const emit = defineEmits<{ resize: [height: number], flow: [enabled: boolean] }>()
const navigation = ref<HTMLElement>()
const moreOpen = ref(false)
const inFlow = ref(false)
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

// Small local line icons share the labels' current color; labels stay visible.
const icons: Record<string, string> = {
  '/': 'm3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7',
  '/people': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-7.87a4 4 0 0 1 0 7.75',
  '/ministries': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-7.87a4 4 0 0 1 0 7.75',
  '/calendar': 'M8 2v4m8-4v4M3 10h18M4 4h16a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1m3 10h2m4 0h2m-8 4h2m4 0h2',
  '/announcements': 'm3 10 14-5v14L3 14v-4Zm14 0h4v4h-4M5 15l2 6h4l-2-5',
  '/chats': 'M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z',
  '/notifications': 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-9 12a3 3 0 0 0 6 0',
  '/settings/profile': 'M20 21v-2a7 7 0 0 0-14 0v2M13 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  '/settings/ical': 'M8 2v4m8-4v4M3 10h18M4 4h16v17H3V4h1m4 11 3 3 5-5',
  '/admin/roles': 'm12 3 9 4v6c0 5-9 9-9 9s-9-4-9-9V7l9-4Zm-4 9 3 3 5-6',
  '/admin/settings': 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-8 0v6',
  '/admin/audit': 'M5 3h14v18H5V3Zm4 5h6m-6 4h6m-6 4h4',
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
  list.push({ to: '/settings/ical', label: 'Календарь телефона' })

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
  if (to === '/settings/profile') return route.path.startsWith('/settings/') && route.path !== '/settings/ical'
  if (to === '/calendar' && route.path.startsWith('/events/')) return true
  return route.path === to || route.path.startsWith(to + '/')
}
const moreActive = computed(() => [...secondaryItems.value, ...adminItems.value].some(item => isActive(item.to)))
watch([() => route.fullPath, () => auth.sessionVersion, () => JSON.stringify(auth.permissions)], () => { moreOpen.value = false })

// Position changes preserve width/height, so observing the border box cannot
// oscillate between modes. The layout reserves only an overlapping mobile bar.
let observer: ResizeObserver | undefined
let desktop: MediaQueryList | undefined
function measureNavigation() {
  if (desktop?.matches) moreOpen.value = false
  const height = Math.ceil(navigation.value?.getBoundingClientRect().height ?? 0)
  const availableHeight = window.visualViewport?.height ?? window.innerHeight
  inFlow.value = !desktop?.matches && height > availableHeight * 0.4
  emit('flow', inFlow.value)
  emit('resize', desktop?.matches || inFlow.value ? 0 : height)
}
onMounted(() => {
  desktop = window.matchMedia('(min-width: 768px)')
  desktop.addEventListener('change', measureNavigation)
  window.addEventListener('resize', measureNavigation)
  window.visualViewport?.addEventListener('resize', measureNavigation)
  observer = new ResizeObserver(measureNavigation)
  if (navigation.value) observer.observe(navigation.value, { box: 'border-box' })
  measureNavigation()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  desktop?.removeEventListener('change', measureNavigation)
  window.removeEventListener('resize', measureNavigation)
  window.visualViewport?.removeEventListener('resize', measureNavigation)
})
</script>

<template>
  <nav ref="navigation" class="app-nav" :class="{ 'app-nav--flow': inFlow, 'app-nav--unread': chats.unreadTotal || notifications.unreadCount }" aria-label="Основная навигация">
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
        <svg class="app-nav__icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="icons[item.to]" /></svg>
        <span data-nav-label>{{ item.label }}</span>
        <span v-if="item.to === '/chats' && chats.unreadTotal" class="app-nav__badge" data-test="chat-badge" :aria-label="`Непрочитанных: ${chats.unreadTotal}`">{{ chats.unreadTotal }}</span>
        <span v-if="item.to === '/notifications' && notifications.unreadCount" class="app-nav__badge" data-test="notification-badge" :aria-label="`Непрочитанных: ${notifications.unreadCount}`">{{ notifications.unreadCount }}</span>
      </NuxtLink>
      <NuxtLink v-if="item.to === '/calendar' && canManageCalendar" to="/templates" class="app-nav__item app-nav__subitem app-nav__secondary" :class="{ 'app-nav__item--active': isActive('/templates') }" :aria-current="isActive('/templates') ? 'page' : undefined" active-class="" exact-active-class=""><svg class="app-nav__icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16v18H4V3Zm4 5h8m-8 4h8m-8 4h4" /></svg><span>Шаблоны</span></NuxtLink>
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
        <svg class="app-nav__icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="icons[item.to]" /></svg>
        <span>{{ item.label }}</span>
      </NuxtLink>
    </div>
    <button type="button" data-test="nav-more" class="app-nav__item app-nav__more" :class="{ 'app-nav__item--active': moreActive }" aria-haspopup="dialog" :aria-expanded="moreOpen" @click="moreOpen = true">
      <svg class="app-nav__icon" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
      <span data-nav-label>Ещё</span>
    </button>
    <NavigationMoreMenu v-if="moreOpen" :items="secondaryItems" :admin-items="adminItems" @close="moreOpen = false" />
  </nav>
</template>

<style scoped>
.app-nav {
  display: flex;
  gap: var(--ui-space-1);
  background: var(--ui-navigation);
  color: var(--ui-text-muted);
}

.app-nav__brand {
  display: flex;
  align-items: center;
  gap: min(var(--ui-space-3), 12px);
  padding: 8px 8px 24px;
  color: var(--ui-text);
  font-weight: 650;
  overflow-wrap: anywhere;
}

.app-nav__mark {
  display: grid;
  place-items: center;
  flex: 0 0 36px;
  height: 36px;
  border: 1px solid var(--ui-accent);
  color: var(--ui-accent);
  border-radius: var(--ui-radius-md);
}

.app-nav__item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: var(--ui-control-height);
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--ui-radius-sm);
  text-decoration: none;
  color: inherit;
  font-size: .875rem;
}
.app-nav__icon { flex: 0 0 20px; width: 20px; height: 20px; }

.app-nav__item:hover {
  background: var(--ui-surface-muted);
  color: var(--ui-accent);
}

.app-nav__item--active {
  font-weight: 600;
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
}
.app-nav__badge { display: inline-block; margin-left: auto; padding: 0.1rem 0.4rem; border-radius: 6px; background: var(--ui-accent); color: var(--ui-on-accent); font-size: .875rem; font-weight: 600; }

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
  .app-nav--flow { position: static; }
  .app-nav__brand, .app-nav__secondary, .app-nav__admin { display: none; }
  .app-nav__item {
    position: relative;
    flex: 1 0 auto;
    flex-direction: column;
    gap: 4px;
    min-width: 44px;
    min-height: 44px;
    padding: 8px 4px;
    border: 0;
    background: transparent;
    font-size: .875rem;
    line-height: 1.5;
    white-space: nowrap;
    text-align: center;
    justify-content: center;
  }
  .app-nav__more { display: flex; }
  .app-nav__item--active { background: var(--ui-accent-soft); }
  .app-nav--unread .app-nav__item { padding-top: calc(1rem + 4px); }
  .app-nav__badge {
    position: absolute;
    top: 2px;
    right: 4px;
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
    flex: 0 0 clamp(224px, var(--ui-sidebar-width), 280px);
    width: clamp(224px, var(--ui-sidebar-width), 280px);
    height: 100vh;
    height: 100dvh;
    overflow-y: auto;
    flex-direction: column;
    align-items: stretch;
    padding: 24px 12px;
    border-right: 1px solid var(--ui-border);
  }
  .app-nav__item { flex-shrink: 0; flex-wrap: wrap; }
  .app-nav__admin { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--ui-border); }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .app-nav { flex-basis: clamp(192px, 12rem, 280px); width: clamp(192px, 12rem, 280px); }
}
</style>
