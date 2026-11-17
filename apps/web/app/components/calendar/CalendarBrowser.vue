<script setup lang="ts">
import type { EventItem, EventRange } from '~/composables/useEvents'
import type { CalendarView } from '~/composables/useCalendarView'
import { legendMinistries, weekRemainder } from '~/composables/useCalendarView'
import { formatCalendarDay, groupCalendarDays } from '~/composables/useEvents'
import MinistryMark from '~/components/ui/MinistryMark.vue'
import CalendarMonth from './CalendarMonth.vue'
import CalendarWeekStrip from './CalendarWeekStrip.vue'
import EventList from './EventList.vue'
const props = defineProps<{ events: EventItem[], state: CalendarView, range: EventRange, returnContext: string, canCreate?: boolean, ministryId?: string, ministries?: { id: string, name: string }[], loading?: boolean, error?: string }>()
const emit = defineEmits<{ update: [change: Partial<CalendarView>], today: [], move: [delta: number], retry: [] }>()
const settings = useSettingsStore(), auth = useAuthStore(), router = useRouter(), { deviceZoneDiffers, todayInChurch } = useChurchDate()
const selected = ref<HTMLElement | null>(null)
const dateInput = ref<HTMLInputElement | null>(null)
const pendingSelection = ref(false)
const listHost = ref<HTMLElement | null>(null)
// Ниже 1024 px (там по умолчанию список) работает макет телефона: шапка, лента недели, ряд чипов, список с сегодня.
const PHONE_QUERY = '(max-width: 1023px)'
const phone = ref(import.meta.client && window.matchMedia(PHONE_QUERY).matches)
let media: MediaQueryList | null = null
const syncPhone = () => { phone.value = !!media?.matches }
onMounted(() => { media = window.matchMedia(PHONE_QUERY); syncPhone(); media.addEventListener?.('change', syncPhone) })
onBeforeUnmount(() => media?.removeEventListener?.('change', syncPhone))
const phoneList = computed(() => phone.value && props.state.view === 'list')
// Список начинается с сегодняшнего дня церкви, если он в показанном месяце; иначе с первого дня месяца.
const startFrom = computed(() => { const today = todayInChurch(); return today >= props.range.from && today <= props.range.to ? today : props.range.from })
const phoneMonthLabel = computed(() => monthLabel.value.replace(/s*г.$/, ''))
const monthLabel = computed(() => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(props.state.date + 'T00:00:00Z')))
const dayLabel = computed(() => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(props.state.date + 'T00:00:00Z')))
const selectedEvents = computed(() => groupCalendarDays(props.events, settings.timezone, { from: props.state.date, to: props.state.date })[0]?.events ?? [])
// «Время церкви» нужно, только если на устройстве другой пояс: проверяем оба края показанного периода.
const zoneDiffers = computed(() => deviceZoneDiffers(`${props.range.from}T12:00:00Z`) || deviceZoneDiffers(`${props.range.to}T12:00:00Z`))
// Легенда: по одной записи на служение, чьи события загружены; «Церковь» и «Вы» показываются всегда.
const legend = computed(() => legendMinistries(props.events))
// «Дальше на неделе»: события после выбранного дня до воскресенья той же недели.
const weekRange = computed(() => weekRemainder(props.state.date))
const weekRest = computed(() => {
  const range = weekRange.value
  if (!range) return []
  const own = new Set(selectedEvents.value.map(event => event.id))
  return props.events.filter(event => !own.has(event.id) && groupCalendarDays([event], settings.timezone, range).length > 0)
})
const createLink = computed(() => ({ path: '/events/new', query: { date: props.state.date, ...(props.ministryId ? { ministry: props.ministryId } : {}), return: props.returnContext } }))
function pickDate() {
  const input = dateInput.value
  if (!input) return
  if (typeof input.showPicker === 'function') { try { input.showPicker(); return } catch { /* нет жеста пользователя: запасной путь ниже */ } }
  input.focus()
}
function select(day: string) { pendingSelection.value = true; emit('update', { date: day }); void focusSelection() }
async function focusSelection() {
  await nextTick()
  const target = phoneList.value ? listHost.value?.querySelector<HTMLElement>('[data-test="selected-day"]') : selected.value
  if (!pendingSelection.value || props.loading || !target) return
  target.scrollIntoView?.({ block: phoneList.value ? 'start' : 'nearest' }); target.focus({ preventScroll: true }); pendingSelection.value = false
}
watch(() => [props.state.date, props.loading], () => { void focusSelection() }, { flush: 'post' })
function open(event: EventItem) { void router.push({ path: `/events/${encodeURIComponent(event.id)}`, query: { return: props.returnContext } }) }
</script>
<template>
  <section class="calendar-browser">
    <template v-if="phone">
      <div class="phone-head">
        <div class="phone-head__month" role="group" aria-label="Период календаря">
          <button class="ui-button" type="button" aria-label="Предыдущий месяц" data-test="previous-month" @click="$emit('move', -1)">‹</button>
          <h2 :aria-label="monthLabel"><button class="calendar-toolbar__title" type="button" data-test="calendar-month-button" title="Перейти к дате" :aria-label="`${monthLabel}, перейти к дате`" @click="pickDate">{{ phoneMonthLabel }}<span aria-hidden="true"> ▾</span></button></h2>
          <button class="ui-button" type="button" aria-label="Следующий месяц" data-test="next-month" @click="$emit('move', 1)">›</button>
          <label class="calendar-toolbar__date" aria-hidden="true"><span class="visually-hidden">Перейти к дате</span><input ref="dateInput" type="date" data-test="calendar-date" tabindex="-1" :value="state.date" @change="select(($event.target as HTMLInputElement).value)"></label>
        </div>
        <button class="ui-button" type="button" data-test="calendar-today" @click="$emit('today')">Сегодня</button>
        <NuxtLink v-if="canCreate && !ministryId" class="ui-button ui-button--primary phone-head__create" data-test="toolbar-create" aria-label="Создать событие" :to="{ path: '/events/new', query: { date: state.date, return: returnContext } }"><span aria-hidden="true">+</span></NuxtLink>
      </div>
      <CalendarWeekStrip v-if="state.view === 'list'" :date="state.date" :events="events" @select="select" />
      <div class="phone-chips" data-test="phone-chips">
        <div v-if="!ministryId" class="calendar-switch" role="group" aria-label="Область календаря"><button v-for="scope in ['church', 'mine']" :key="scope" type="button" :data-test="`scope-${scope}`" :aria-pressed="state.scope === scope" @click="emit('update', { scope })">{{ scope === 'church' ? 'Все' : 'Мои' }}</button></div>
        <label v-if="!ministryId && ministries?.length" class="calendar-ministry"><span class="visually-hidden">Служение</span><select aria-label="Служение" :value="state.scope.startsWith('ministry:') ? state.scope : 'church'" @change="emit('update', { scope: ($event.target as HTMLSelectElement).value })"><option value="church">Все служения</option><option v-for="item in ministries" :key="item.id" :value="`ministry:${item.id}`">{{ item.name }}</option></select></label>
        <button type="button" class="ui-button phone-chips__view" data-test="phone-view-switch" :aria-pressed="state.view === 'month'" @click="emit('update', { view: state.view === 'list' ? 'month' : 'list' })">Месяц</button>
      </div>
    </template>
    <div v-else class="calendar-toolbar">
      <div class="calendar-toolbar__month" role="group" aria-label="Период календаря">
        <button class="ui-button" type="button" aria-label="Предыдущий месяц" data-test="previous-month" @click="$emit('move', -1)">‹</button>
        <h2 :aria-label="monthLabel"><button class="calendar-toolbar__title" type="button" data-test="calendar-month-button" title="Перейти к дате" :aria-label="`${monthLabel}, перейти к дате`" @click="pickDate">{{ monthLabel }}<span aria-hidden="true"> ▾</span></button></h2>
        <button class="ui-button" type="button" aria-label="Следующий месяц" data-test="next-month" @click="$emit('move', 1)">›</button>
        <label class="calendar-toolbar__date" aria-hidden="true"><span class="visually-hidden">Перейти к дате</span><input ref="dateInput" type="date" data-test="calendar-date" tabindex="-1" :value="state.date" @change="select(($event.target as HTMLInputElement).value)"></label>
      </div>
      <button class="ui-button" type="button" data-test="calendar-today" @click="$emit('today')">Сегодня</button>
      <div v-if="!ministryId" class="calendar-switch" role="group" aria-label="Область календаря"><button v-for="scope in ['church', 'mine']" :key="scope" type="button" :data-test="`scope-${scope}`" :aria-pressed="state.scope === scope" @click="emit('update', { scope })">{{ scope === 'church' ? 'Все' : 'Мои' }}</button></div>
      <label v-if="!ministryId && ministries?.length" class="calendar-ministry"><span>Служение</span><select :value="state.scope.startsWith('ministry:') ? state.scope : 'church'" @change="emit('update', { scope: ($event.target as HTMLSelectElement).value })"><option value="church">Все служения</option><option v-for="item in ministries" :key="item.id" :value="`ministry:${item.id}`">{{ item.name }}</option></select></label>
      <div class="calendar-switch" role="group" aria-label="Вид календаря"><button v-for="view in (['month', 'list'] as const)" :key="view" type="button" :aria-pressed="state.view === view" @click="emit('update', { view })">{{ view === 'month' ? 'Месяц' : 'Список' }}</button></div>
    <NuxtLink v-if="canCreate && !ministryId" class="ui-button ui-button--primary calendar-toolbar__create" data-test="toolbar-create" aria-label="Создать событие" :to="{ path: '/events/new', query: { date: state.date, return: returnContext } }"><span aria-hidden="true">+</span>Событие</NuxtLink>
    </div>
    <ul v-if="!phone && state.view === 'month' && !loading && !error" class="calendar-legend" data-test="calendar-legend" aria-label="Обозначения цветов">
      <li><MinistryMark :ministry="null" variant="dot" /></li>
      <li v-for="item in legend" :key="item.id"><MinistryMark :ministry="item" variant="dot" /></li>
      <li v-if="auth.person"><span class="calendar-legend__you">Вы</span> — вы назначены</li>
    </ul>
    <p v-if="zoneDiffers || state.scope === 'mine'" class="calendar-zone"><template v-if="zoneDiffers">Время церкви · {{ settings.timezone }}</template><template v-if="state.scope === 'mine'"><template v-if="zoneDiffers"> · </template>Ваши назначения</template></p>
    <p v-if="loading" role="status">Загружаем календарь…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" class="ui-button" data-test="retry-calendar" @click="$emit('retry')">Повторить</button></p>
    <div v-else-if="state.view === 'month'" class="calendar-layout">
      <CalendarMonth :events="events" :date="state.date" @select="select" @open="open" />
      <section ref="selected" class="calendar-selected" data-test="selected-day" tabindex="-1" aria-label="Выбранный день">
        <h2><time :datetime="state.date">{{ formatCalendarDay(state.date) }}</time></h2>
        <NuxtLink v-if="canCreate" class="ui-button" :to="createLink">Создать на {{ dayLabel }}</NuxtLink>
        <EventList :events="selectedEvents" :range="{ from: state.date, to: state.date }" :return-context="returnContext" hide-date empty-description="На выбранный день доступных событий нет." />
        <section v-if="weekRange && weekRest.length" class="calendar-week-rest" data-test="week-rest" aria-label="Дальше на неделе"><h2>Дальше на неделе</h2><EventList :events="weekRest" :range="weekRange" :return-context="returnContext" /></section>
      </section>
    </div>
    <div v-else-if="phoneList" ref="listHost" class="calendar-feed">
      <EventList :events="events" :range="range" :return-context="returnContext" :start-from="startFrom" :selected-day="state.date" />
    </div>
    <template v-else>
      <section ref="selected" class="calendar-selected calendar-selected--list" data-test="selected-day" tabindex="-1" aria-label="Выбранный день"><h2><time :datetime="state.date">{{ formatCalendarDay(state.date) }}</time></h2><NuxtLink v-if="canCreate" class="ui-button" :to="createLink">Создать на {{ dayLabel }}</NuxtLink><EventList :events="selectedEvents" :range="{ from: state.date, to: state.date }" :return-context="returnContext" hide-date empty-description="На выбранный день доступных событий нет." /></section>
      <h2 class="calendar-remaining">Остальные события месяца</h2><EventList :events="events" :range="range" :return-context="returnContext" :exclude-date="state.date" />
    </template>
  </section>
</template>
<style scoped>
.calendar-browser { min-width: 0; container-type: inline-size; }
.calendar-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-3); }
.calendar-toolbar__month { position: relative; display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.calendar-toolbar__create { display: inline-flex; align-items: center; gap: 6px; }
.calendar-toolbar__title { min-height: 44px; padding: 8px 12px; border: 0; border-radius: var(--ui-radius-sm); background: transparent; font: inherit; font-weight: 700; color: var(--ui-text); }
.calendar-toolbar__title:hover { background: var(--ui-accent-soft); }
h2 { margin: 0; font-size: 1.25rem; }
.calendar-toolbar__date { position: absolute; left: 0; bottom: 0; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
.phone-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.phone-head > .ui-button { padding-inline: 8px; }
.phone-head__month { position: relative; display: flex; align-items: center; flex: 1 1 auto; min-width: 0; gap: 2px; }
.phone-head__month h2 { flex: 1 1 auto; min-width: 0; font-size: 1rem; }
.phone-head__month .calendar-toolbar__title { width: 100%; padding-inline: 4px; text-align: center; }
.phone-head__create { font-size: 1.25rem; }
.phone-chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-2); margin-top: var(--ui-space-2); }
.phone-chips .calendar-ministry { flex: 1 1 8rem; }
.phone-chips .calendar-ministry select { width: 100%; max-width: none; min-height: 44px; }
.phone-chips__view { margin-inline-start: auto; }
.phone-chips__view[aria-pressed=true] { color: var(--ui-accent); background: var(--ui-accent-soft); border-color: var(--ui-accent); }
.calendar-feed { margin-top: var(--ui-space-4); }
.calendar-ministry { display: flex; align-items: center; gap: var(--ui-space-2); min-width: 0; max-width: 100%; font-size: .875rem; }
.calendar-ministry select { min-width: 0; max-width: 14rem; }
.calendar-switch { display: flex; flex-wrap: wrap; border: 1px solid var(--ui-border); padding: 3px; border-radius: var(--ui-radius-sm); background: var(--ui-surface); }
.calendar-switch button { min-height: 44px; padding: 8px 12px; border: 0; background: transparent; }
.calendar-switch button[aria-pressed=true] { color: var(--ui-accent); background: var(--ui-accent-soft); }
.calendar-legend { display: flex; flex-wrap: wrap; gap: var(--ui-space-2) var(--ui-space-4); margin: var(--ui-space-3) 0 0; padding: 0; list-style: none; font-size: .875rem; }
.calendar-legend li { display: inline-flex; align-items: center; gap: var(--ui-space-2); min-width: 0; }
.calendar-legend__you { padding: 0 6px; border: 1px solid currentColor; border-radius: 999px; font-weight: 600; }
.calendar-zone { font-size: .875rem; color: var(--ui-text-muted); margin: var(--ui-space-3) 0 0; }
.calendar-layout { display: grid; gap: var(--ui-space-6); align-items: start; min-width: 0; margin-top: var(--ui-space-4); }
.calendar-selected { min-width: 0; display: grid; gap: var(--ui-space-3); }
.calendar-selected > a { justify-self: start; max-width: 100%; }
.calendar-week-rest { display: grid; gap: var(--ui-space-3); margin-top: var(--ui-space-3); }
.calendar-remaining { margin-block: var(--ui-space-6) var(--ui-space-4); }
.visually-hidden { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); overflow: hidden; }
@container (min-width: 1000px) { .calendar-layout { grid-template-columns: minmax(0, 1fr) 300px; } }
@container (max-width: 450px) { .calendar-toolbar__month { flex-basis: 100%; } .calendar-toolbar__month h2 { flex: 1 1 8rem; } }
</style>
