// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRouter } from '#app'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import RecurrenceEditor from '~/components/calendar/RecurrenceEditor.vue'
import TemplateEditor from '~/components/calendar/TemplateEditor.vue'
import TemplatePage from '~/pages/templates/[id].vue'
import TemplatesPage from '~/pages/templates/index.vue'
import MinistryEvents from '~/pages/ministries/[id]/events.vue'
import IcalPage from '~/pages/settings/ical.vue'
import AppNav from '~/components/AppNav.vue'
import SettingsTabs from '~/components/settings/SettingsTabs.vue'
import MinistryTabs from '~/components/ministries/MinistryTabs.vue'
import EventEditor from '~/components/calendar/EventEditor.vue'
import { useAuthStore } from '~/stores/auth'
import { useSettingsStore } from '~/stores/settings'
import { grantPermissions } from '../support/permissions'
import type { components } from '~~/types/api'
type Template = components['schemas']['EventTemplateResource']
const { get, post, patch, push, route } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), push: vi.fn(), route: { params: { id: 't1' } } }))
mockNuxtImport('useApi', () => () => ({ get, post, patch }))
mockNuxtImport('useRoute', () => () => route)
enableAutoUnmount(afterEach)
const template = (over: Partial<Template> = {}): Template => ({ id: 't1', title: 'Воскресное служение', description: null, location: null, recurrence: null, active: true, archived: false, can_manage: true, slots: [], owner_type: 'church', ministry: null, start_time: '10:00', duration_minutes: 120, visibility: 'church', generated_until: '2027-01-01', ...over })
beforeEach(() => {
  vi.resetAllMocks(); route.params.id = 't1'
  vi.spyOn(useRouter(), 'push').mockImplementation(push)
  grantPermissions({ global: ['calendar.church.manage'] })
  useSettingsStore().apply({ church_name: 'Церковь', timezone: 'Asia/Vladivostok' } as never)
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/templates/t1' ? template() : [] }))
  post.mockResolvedValue({ data: template() }); patch.mockResolvedValue({ data: template() })
})
it('switches recurrence variants without leaking fields and explains anchor phase', async () => {
  const w = await mountSuspended(RecurrenceEditor, { props: { modelValue: null } })
  await w.get('[data-test="type"]').setValue('biweekly')
  await w.get('[data-test="weekday"]').setValue('6')
  await w.get('[data-test="anchor"]').setValue('2026-11-07')
  expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual({ type: 'biweekly', weekday: 6, anchor_date: '2026-11-07' })
  expect(w.text()).toContain('раньше опорной даты')
  await w.get('[data-test="type"]').setValue('monthly_nth_weekday')
  await w.get('[data-test="nth"]').setValue('-1')
  expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual({ type: 'monthly_nth_weekday', weekday: 6, nth: -1 })
  expect(w.get('[data-test="nth"] option[value="-1"]').text()).toBe('Последний')
  await w.get('[data-test="type"]').setValue('weekly')
  expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual({ type: 'weekly', weekday: 6 })
  await w.get('[data-test="type"]').setValue('none')
  expect(w.emitted('update:modelValue')!.at(-1)![0]).toBeNull()
})
it('creates a template with civil HH:MM, recurrence and shared slot editor', async () => {
  const w = await mountSuspended(TemplateEditor, { props: { defaultOwner: { type: 'church' } } })
  await w.get('[data-test="title"]').setValue('Служение')
  await w.get('[data-test="start-time"]').setValue('10:00')
  await w.get('[data-test="duration"]').setValue('120')
  const r = w.getComponent(RecurrenceEditor)
  await r.get('[data-test="type"]').setValue('weekly'); await r.get('[data-test="weekday"]').setValue('7')
  await w.get('[data-test="add-slot"]').trigger('click'); await w.get('[data-test="slot-0-label"]').setValue('Дежурный')
  await w.get('form').trigger('submit'); await flushPromises()
  expect(post).toHaveBeenCalledWith('/templates', expect.objectContaining({ owner_type: 'church', start_time: '10:00', duration_minutes: 120, recurrence: { type: 'weekly', weekday: 7 }, slots: [{ role_id: null, label: 'Дежурный', required_count: 1 }] }))
  expect(w.emitted('saved')).toHaveLength(1)
  expect(get).toHaveBeenCalledWith('/calendar/slot-choices', { owner_type: 'church' })
})
it('patches only edited template fields without replacing slots or owner', async () => {
  const w = await mountSuspended(TemplateEditor, { props: { template: template({ slots: [{ id: 's1', label: 'Вокалист', role: { id: 'r1', name: 'Вокалист', ministry_id: 'm2' }, required_count: 2, sort_order: 0 }] }) } })
  await w.get('[data-test="title"]').setValue('Новое название'); await w.get('form').trigger('submit'); await flushPromises()
  expect(patch).toHaveBeenCalledWith('/templates/t1', { title: 'Новое название' })
  expect(w.find('[data-test="owner"]').exists()).toBe(false)
  expect(w.text()).toContain('уже созданные события')
})
it('sends edited slot list and offers only manageable owners', async () => {
  grantPermissions({ ministries: { m1: ['events.manage'] } })
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/ministries' ? [{ id: 'm1', name: 'Хор' }, { id: 'm2', name: 'Другое' }] : [{ id: 'm2', name: 'Другое', roles: [{ id: 'r1', name: 'Вокалист' }] }] }))
  const w = await mountSuspended(TemplateEditor, { props: { defaultOwner: { type: 'ministry', ministryId: 'm1' } } })
  expect(w.findAll('[data-test="owner"] option').map(o => o.text())).toEqual(['Хор'])
  await w.get('[data-test="title"]').setValue('Репетиция'); await w.get('[data-test="add-slot"]').trigger('click'); await w.get('[data-test="slot-0-role"]').setValue('r1')
  await w.get('form').trigger('submit'); await flushPromises()
  expect(post).toHaveBeenCalledWith('/templates', expect.objectContaining({ owner_type: 'ministry', ministry_id: 'm1', slots: [{ role_id: 'r1', label: null, required_count: 1 }] }))
  expect(get).toHaveBeenCalledWith('/calendar/slot-choices', { owner_type: 'ministry', ministry_id: 'm1' })
})
it('blocks invalid slots and displays domain errors without losing input', async () => {
  const w = await mountSuspended(TemplateEditor)
  await w.get('[data-test="title"]').setValue('Название'); await w.get('[data-test="add-slot"]').trigger('click'); await w.get('form').trigger('submit')
  expect(post).not.toHaveBeenCalled(); expect(w.text()).toContain('Свободному слоту нужна подпись')
  await w.get('[data-test="slot-0-label"]').setValue('Дежурный'); post.mockRejectedValue({ statusCode: 422, data: { message: 'Служение архивировано.' } })
  await w.get('form').trigger('submit'); await flushPromises()
  expect(w.text()).toContain('Служение архивировано.'); expect((w.get('[data-test="title"]').element as HTMLInputElement).value).toBe('Название')
})
it('manually creates from an inactive template and links to the created event', async () => {
  get.mockResolvedValue({ data: template({ active: false }) }); post.mockResolvedValue({ data: { id: 'e1' } })
  const w = await mountSuspended(TemplatePage)
  await w.get('[data-test="event-date"]').setValue('2026-12-24'); await w.get('[data-test="create-event"]').trigger('click'); await flushPromises()
  expect(post).toHaveBeenCalledWith('/templates/t1/create-event', { date: '2026-12-24' }); expect(push).toHaveBeenCalledWith('/events/e1')
})
it('toggles active, edits and archives only after confirmation', async () => {
  const w = await mountSuspended(TemplatePage)
  patch.mockResolvedValue({ data: template({ active: false }) })
  await w.get('[data-test="toggle-active"]').trigger('click'); await flushPromises()
  expect(patch).toHaveBeenCalledWith('/templates/t1', { active: false })
  await w.get('[data-test="edit-template"]').trigger('click'); expect(w.findComponent(TemplateEditor).exists()).toBe(true)
  w.getComponent(TemplateEditor).vm.$emit('cancel'); await flushPromises()
  await w.get('[data-test="archive-template"]').trigger('click'); expect(post).not.toHaveBeenCalled()
  post.mockResolvedValue({ data: template({ archived: true, active: false }) })
  await w.get('[data-test="confirm-archive"]').trigger('click'); await flushPromises()
  expect(post).toHaveBeenCalledWith('/templates/t1/archive'); expect(w.find('[data-test="create-event"]').exists()).toBe(false)
})
it.each([{ can_manage: false }, { archived: true }])('keeps template detail readonly for %j', async (over) => {
  get.mockResolvedValue({ data: template(over) }); const w = await mountSuspended(TemplatePage)
  expect(w.text()).toContain('Воскресное служение'); expect(w.find('[data-test="edit-template"]').exists()).toBe(false); expect(w.find('[data-test="create-event"]').exists()).toBe(false)
})
it('lists recurrence, state and owner filter, and opens creation', async () => {
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/templates' ? [template({ recurrence: { type: 'weekly', weekday: 7 }, active: false, archived: true })] : [{ id: 'm1', name: 'Хор' }] }))
  const w = await mountSuspended(TemplatesPage)
  expect(w.text()).toContain('Каждое воскресенье'); expect(w.text()).toContain('Неактивен'); expect(w.text()).toContain('Архив')
  expect(w.find('a[href="/templates/t1"]').exists()).toBe(true)
  await w.get('[data-test="owner-filter"]').setValue('m1'); await flushPromises()
  expect(get).toHaveBeenCalledWith('/templates', { scope: 'ministry:m1', archived: false })
  await w.get('[data-test="include-archived"]').setValue(true); await flushPromises()
  expect(get).toHaveBeenCalledWith('/templates', { scope: 'ministry:m1', archived: true })
  await w.get('[data-test="new-template"]').trigger('click'); expect(w.findComponent(TemplateEditor).exists()).toBe(true)
})
it('keeps readable templates accessible without management and reacts to revoked rights', async () => {
  get.mockResolvedValue({ data: [] }); const w = await mountSuspended(TemplatesPage)
  expect(w.find('[data-test="new-template"]').exists()).toBe(true)
  grantPermissions(); await flushPromises()
  expect(w.find('[data-test="new-template"]').exists()).toBe(false)
  const nav = await mountSuspended(AppNav); expect(nav.find('a[href="/templates"]').exists()).toBe(false)
  grantPermissions({ ministries: { m1: ['events.manage'] } }); await flushPromises()
  expect(nav.find('a[href="/templates"]').exists()).toBe(true)
})
it('loads ministry events and opens the shared creation editor for its owner', async () => {
  grantPermissions({ ministries: { t1: ['events.manage'] } })
  get.mockImplementation((url: string) => Promise.resolve(url === '/events' ? { data: [], meta: { last_page: 1 } } : url === '/ministries/t1' ? { data: { id: 't1', name: 'Хор', archived_at: null } } : { data: [] }))
  const w = await mountSuspended(MinistryEvents)
  expect(get).toHaveBeenCalledWith('/events', expect.objectContaining({ scope: 'ministry:t1' }))
  await w.get('[data-test="create-event"]').trigger('click')
  expect(w.getComponent(EventEditor).props('defaultOwner')).toEqual({ type: 'ministry', ministryId: 't1' })
  const tabs = await mountSuspended(MinistryTabs, { props: { ministryId: 't1' } }); expect(tabs.find('a[href="/ministries/t1/events"]').exists()).toBe(true)
  grantPermissions(); await flushPromises(); expect(w.find('[data-test="create-event"]').exists()).toBe(false)
})
it('keeps archived ministry events readonly', async () => {
  grantPermissions({ ministries: { t1: ['events.manage'] } })
  get.mockImplementation((url: string) => Promise.resolve(url === '/events' ? { data: [], meta: { last_page: 1 } } : { data: { id: 't1', name: 'Хор', archived_at: '2026-10-01' } }))
  const w = await mountSuspended(MinistryEvents); expect(w.find('[data-test="create-event"]').exists()).toBe(false)
})
it('copies iCal with feedback, confirms rotation and updates auth for later navigation', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal('navigator', { clipboard: { writeText } })
  const oldUrl = useAuthStore().user!.ical_url
  post.mockResolvedValue({ data: { ical_url: 'https://church.test/api/v1/calendar/feed/new.ics' } })
  const w = await mountSuspended(IcalPage)
  expect(w.get('[data-test="ical-url"]').text()).toContain(oldUrl)
  await w.get('[data-test="copy"]').trigger('click'); await flushPromises(); expect(writeText).toHaveBeenCalledWith(oldUrl); expect(w.text()).toContain('Ссылка скопирована')
  await w.get('[data-test="rotate"]').trigger('click'); expect(post).not.toHaveBeenCalled(); expect(w.get('dialog').text()).toContain('Старая ссылка перестанет работать')
  await w.get('[data-test="confirm-rotate"]').trigger('click'); await flushPromises()
  expect(post).toHaveBeenCalledWith('/me/ical-token/rotate'); expect(useAuthStore().user!.ical_url).toContain('/feed/new.ics')
  const next = await mountSuspended(IcalPage); expect(next.text()).toContain('/feed/new.ics')
  const tabs = await mountSuspended(SettingsTabs); expect(tabs.find('a[href="/settings/ical"]').exists()).toBe(true)
  vi.unstubAllGlobals()
})
it('shows copy failure and does not apply late rotation to another account', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
  const w = await mountSuspended(IcalPage)
  await w.get('[data-test="copy"]').trigger('click'); await flushPromises(); expect(w.text()).toContain('Не удалось скопировать')
  let resolve!: (value: unknown) => void
  post.mockImplementation(() => new Promise(r => { resolve = r }))
  await w.get('[data-test="rotate"]').trigger('click'); await w.get('[data-test="confirm-rotate"]').trigger('click')
  const auth = useAuthStore(); auth.sessionVersion++; auth.user = { ...auth.user!, id: 'other', ical_url: 'https://church.test/other.ics' }
  resolve({ data: { ical_url: 'https://church.test/old-account-new.ics' } }); await flushPromises()
  expect(auth.user.ical_url).toBe('https://church.test/other.ics'); expect(w.text()).not.toContain('old-account-new')
  vi.unstubAllGlobals()
})
it('retains a successful iCal rotation in auth after leaving and reopening settings', async () => {
  let resolve!: (value: unknown) => void
  post.mockImplementation(() => new Promise(r => { resolve = r }))
  const w = await mountSuspended(IcalPage)
  await w.get('[data-test="rotate"]').trigger('click'); await w.get('[data-test="confirm-rotate"]').trigger('click')
  w.unmount()
  resolve({ data: { ical_url: 'https://church.test/api/v1/calendar/feed/after-navigation.ics' } }); await flushPromises()
  const next = await mountSuspended(IcalPage)
  expect(useAuthStore().user!.ical_url).toContain('/feed/after-navigation.ics')
  expect(next.get('[data-test="ical-url"]').text()).toContain('/feed/after-navigation.ics')
})

it('opens a native iCal dialog and closes with Escape without rotating', async () => {
  const w = await mountSuspended(IcalPage)
  await w.get('[data-test="rotate"]').trigger('click')
  expect(w.get('dialog').attributes('aria-label')).toBe('Перевыпуск ссылки календаря')
  await w.get('dialog').trigger('cancel'); await flushPromises()
  expect(w.find('dialog').attributes('open')).toBeUndefined()
  expect(post).not.toHaveBeenCalled()
})
