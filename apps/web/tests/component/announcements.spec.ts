// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AnnouncementEditor from '~/components/announcements/AnnouncementEditor.vue'
import AnnouncementsIndex from '~/pages/announcements/index.vue'
import AnnouncementPage from '~/pages/announcements/[id].vue'
import MinistryAnnouncements from '~/pages/ministries/[id]/announcements.vue'
import PinnedAnnouncements from '~/components/announcements/PinnedAnnouncements.vue'
import MediaUploader from '~/components/MediaUploader.vue'
import AttachmentList from '~/components/announcements/AttachmentList.vue'
import { grantPermissions } from '../support/permissions'
import type { Announcement } from '~/utils/announcements'
import { useSettingsStore } from '~/stores/settings'

const get = vi.fn(), post = vi.fn(), patch = vi.fn()
mockNuxtImport('useApi', () => () => ({ get, post, patch }))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'a1' } }))
enableAutoUnmount(afterEach)
const announcement = (over: Partial<Announcement> = {}): Announcement => ({
  id: 'a1', scope: 'church', ministry: null, author: { id: 'other', full_name: 'Иван Иванов' },
  title: 'Собрание', body: 'В **10:00**', pinned: false, hide_after: null, notify_on_publish: true,
  published_at: '2026-10-01T07:00:00Z', archived: false, attachments: [], ...over,
})
const list = (data: Announcement[] = [], page = 1, last = 1) => ({ data, meta: { current_page: page, last_page: last, total: data.length } })
beforeEach(() => { [get, post, patch].forEach(fn => fn.mockReset()); grantPermissions() })

describe('announcement lists', () => {
  it('gates publication by permission and marks pinned cards', async () => {
    get.mockResolvedValue(list([announcement({ pinned: true })]))
    const page = await mountSuspended(AnnouncementsIndex)
    expect(page.find('[data-test="publish"]').exists()).toBe(false)
    expect(page.find('[data-test="pinned-a1"]').exists()).toBe(true)
    grantPermissions({ global: ['announcements.church.publish'] })
    await page.vm.$nextTick()
    expect(page.find('[data-test="publish"]').exists()).toBe(true)
  })
  it('appends subsequent pages and filters ministries', async () => {
    get.mockResolvedValueOnce(list([announcement()], 1, 2)).mockResolvedValueOnce(list([announcement({ id: 'a2' })], 2, 2)).mockResolvedValueOnce(list())
    const page = await mountSuspended(AnnouncementsIndex)
    await page.get('[data-test="more"]').trigger('click'); await flushPromises()
    expect(page.findAll('article')).toHaveLength(2)
    expect(get).toHaveBeenLastCalledWith('/announcements', expect.objectContaining({ page: 2, scope: 'church' }))
    await page.get('select').setValue('ministry'); await flushPromises()
    expect(get).toHaveBeenLastCalledWith('/announcements', expect.objectContaining({ page: 1, scope: 'ministry' }))
  })
  it('uses the ministry and its publication permission', async () => {
    grantPermissions({ ministries: { a1: ['announcements.publish'] } }); get.mockResolvedValue(list())
    const page = await mountSuspended(MinistryAnnouncements)
    expect(get).toHaveBeenCalledWith('/announcements', expect.objectContaining({ scope: 'ministry', ministry: 'a1' }))
    expect(page.find('[data-test="publish"]').exists()).toBe(true)
  })
  it('home only renders actual pinned church records, up to three', async () => {
    get.mockResolvedValue(list([announcement(), ...[1, 2, 3, 4].map(id => announcement({ id: String(id), pinned: true }))]))
    const page = await mountSuspended(PinnedAnnouncements)
    expect(page.findAll('article')).toHaveLength(3)
    expect(page.find('[data-test="pinned-a1"]').exists()).toBe(false)
    expect(get).toHaveBeenCalledWith('/announcements', expect.objectContaining({ scope: 'church' }))
  })
})
describe('announcement detail', () => {
  it.each([false, true])('blocks conflicting detail actions while editing pinned=%s and saves the intended state', async (pinned) => {
    grantPermissions({ global: ['announcements.church.publish'] })
    get.mockResolvedValue({ data: announcement({ pinned }) })
    patch.mockResolvedValue({ data: announcement({ pinned, title: 'Новое название' }) })
    const page = await mountSuspended(AnnouncementPage)
    await page.get('[data-test="edit"]').trigger('click')
    await page.get('[data-test="pin"]').trigger('click')
    await page.get('[data-test="archive"]').trigger('click')
    expect(page.get('[data-test="pin"]').attributes('disabled')).toBeDefined()
    expect(page.get('[data-test="archive"]').attributes('disabled')).toBeDefined()
    expect(post).not.toHaveBeenCalled()
    expect(page.find('[data-test="confirm-archive"]').exists()).toBe(false)
    await page.get('[data-test="title"]').setValue('Новое название')
    await page.get('form').trigger('submit'); await flushPromises()
    expect(patch).toHaveBeenCalledWith('/announcements/a1', expect.objectContaining({ pinned, title: 'Новое название' }))
  })
  it.each([false, true])('opens the editor only after a pending pin/unpin pinned=%s completes', async (pinned) => {
    grantPermissions({ global: ['announcements.church.publish'] })
    get.mockResolvedValue({ data: announcement({ pinned }) })
    let complete!: (value: { data: Announcement }) => void
    post.mockReturnValue(new Promise(resolve => { complete = resolve }))
    patch.mockResolvedValue({ data: announcement({ pinned: !pinned }) })
    const page = await mountSuspended(AnnouncementPage)
    await page.get('[data-test="pin"]').trigger('click')
    await page.get('[data-test="edit"]').trigger('click')
    expect(page.get('[data-test="edit"]').attributes('disabled')).toBeDefined()
    expect(page.find('form').exists()).toBe(false)
    complete({ data: announcement({ pinned: !pinned }) }); await flushPromises()
    await page.get('[data-test="edit"]').trigger('click')
    await page.get('[data-test="title"]').setValue('Правка после закрепления')
    await page.get('form').trigger('submit'); await flushPromises()
    expect(patch).toHaveBeenCalledWith('/announcements/a1', expect.objectContaining({ pinned: !pinned }))
  })
  it('renders Markdown and hides restricted actions and absent views', async () => {
    get.mockResolvedValue({ data: announcement() })
    const page = await mountSuspended(AnnouncementPage)
    expect(page.get('[data-test="body"]').html()).toContain('<strong>10:00</strong>')
    expect(page.find('[data-test="edit"]').exists()).toBe(false)
    expect(page.find('[data-test="views"]').exists()).toBe(false)
  })
  it('compares the account author ID and confirms archive', async () => {
    get.mockResolvedValue({ data: announcement({ author: { id: 'u-signed-in', full_name: 'Автор' }, views_count: 12 }) })
    post.mockResolvedValue({ data: announcement({ archived: true }) })
    const page = await mountSuspended(AnnouncementPage)
    expect(page.get('[data-test="views"]').text()).toContain('12')
    expect(page.find('[data-test="edit"]').exists()).toBe(true)
    await page.get('[data-test="archive"]').trigger('click')
    expect(post).not.toHaveBeenCalled()
    await page.get('[data-test="confirm-archive"]').trigger('click'); await flushPromises()
    expect(post).toHaveBeenCalledWith('/announcements/a1/archive')
    expect(page.find('[data-test="edit"]').exists()).toBe(false)
  })
  it('does not offer edit/pin/archive on archived records even to publishers', async () => {
    grantPermissions({ global: ['announcements.church.publish'] })
    get.mockResolvedValue({ data: announcement({ archived: true }) })
    const page = await mountSuspended(AnnouncementPage)
    for (const action of ['edit', 'pin', 'archive']) expect(page.find(`[data-test="${action}"]`).exists()).toBe(false)
  })
  it('formats publication in church timezone without shifting the civil hide date', async () => {
    const settings = useSettingsStore()
    const previous = settings.timezone
    settings.timezone = 'America/Los_Angeles'
    try {
      get.mockResolvedValue({ data: announcement({ published_at: '2026-10-01T02:00:00Z', hide_after: '2026-10-30' }) })
      const page = await mountSuspended(AnnouncementPage)
      expect(page.text()).toContain('30 сент.')
      expect(page.text()).toContain('Скрыть после: 30.10.2026')
    } finally { settings.timezone = previous }
  })
  it('allows ministry publishers and keeps pin errors visible', async () => {
    grantPermissions({ ministries: { m1: ['announcements.publish'] } })
    get.mockResolvedValue({ data: announcement({ scope: 'ministry', ministry: { id: 'm1', name: 'Хор' }, author: null }) })
    post.mockRejectedValue({ statusCode: 403 })
    const page = await mountSuspended(AnnouncementPage)
    await page.get('[data-test="pin"]').trigger('click'); await flushPromises()
    expect(post).toHaveBeenCalledWith('/announcements/a1/pin')
    expect(page.text()).toContain('Нет права на это действие.')
  })
})
describe('announcement editor', () => {
  it('blocks save while uploading and on upload errors, then includes ready IDs', async () => {
    post.mockResolvedValue({ data: announcement() })
    const editor = await mountSuspended(AnnouncementEditor, { props: { scope: 'church' } })
    await editor.get('[data-test="title"]').setValue('Заголовок'); await editor.get('[data-test="body"]').setValue('Текст')
    const uploader = editor.findComponent(MediaUploader)
    uploader.vm.$emit('busy', true); await flushPromises()
    await editor.get('form').trigger('submit'); expect(post).not.toHaveBeenCalled()
    uploader.vm.$emit('busy', false); uploader.vm.$emit('error', 'Ошибка загрузки'); await flushPromises()
    await editor.get('form').trigger('submit'); expect(post).not.toHaveBeenCalled()
    uploader.vm.$emit('error', ''); uploader.vm.$emit('update:mediaIds', ['ready']); await flushPromises()
    await editor.get('form').trigger('submit'); await flushPromises()
    expect(post).toHaveBeenCalledWith('/announcements', expect.objectContaining({ media_ids: ['ready'] }))
  })
  it.each(['church', 'ministry'] as const)('creates %s with defaults and media IDs', async (scope) => {
    post.mockResolvedValue({ data: announcement() })
    const editor = await mountSuspended(AnnouncementEditor, { props: { scope, ministryId: 'm1' } })
    await editor.get('[data-test="title"]').setValue('Собрание'); await editor.get('[data-test="body"]').setValue('Текст')
    await editor.get('form').trigger('submit'); await flushPromises()
    expect(post).toHaveBeenCalledWith('/announcements', expect.objectContaining({ scope, title: 'Собрание', notify_on_publish: true, pinned: false, media_ids: [], ...(scope === 'ministry' ? { ministry_id: 'm1' } : {}) }))
    expect(editor.emitted('saved')).toHaveLength(1)
  })
  it('retains existing attachments from another editor and civil hide date; omits notify on patch', async () => {
    const item = announcement({ hide_after: '2026-10-30', attachments: [{ id: 'old', kind: 'document', status: 'ready', url: '/media/old', thumb_url: null }] })
    patch.mockResolvedValue({ data: item })
    const editor = await mountSuspended(AnnouncementEditor, { props: { scope: 'church', announcement: item } })
    await editor.get('form').trigger('submit'); await flushPromises()
    expect(patch).toHaveBeenCalledWith('/announcements/a1', expect.objectContaining({ media_ids: ['old'], hide_after: '2026-10-30' }))
    expect(patch.mock.calls[0]![1]).not.toHaveProperty('notify_on_publish')
    expect(patch.mock.calls[0]![1]).not.toHaveProperty('scope')
  })
  it('validates required fields and preserves input on server failure', async () => {
    const editor = await mountSuspended(AnnouncementEditor, { props: { scope: 'church' } })
    await editor.get('form').trigger('submit'); expect(post).not.toHaveBeenCalled()
    post.mockRejectedValue({ statusCode: 422, data: { message: 'Проверьте поля.', errors: { title: ['Ошибка заголовка'] } } })
    await editor.get('[data-test="title"]').setValue('Текст'); await editor.get('[data-test="body"]').setValue('Текст')
    await editor.get('form').trigger('submit'); await flushPromises()
    expect(editor.text()).toContain('Ошибка заголовка')
    expect((editor.get('[data-test="title"]').element as HTMLInputElement).value).toBe('Текст')
  })
})

it('renders image thumbnails and generic document links using the media resource', async () => {
  const wrapper = await mountSuspended(AttachmentList, { props: { attachments: [
    { id: 'i', kind: 'image', status: 'ready', url: '/media/i', thumb_url: '/media/i/thumb' },
    { id: 'd', kind: 'document', status: 'ready', url: '/media/d', thumb_url: null },
  ] } })
  expect(wrapper.get('img').attributes('src')).toBe('/media/i/thumb')
  expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual(['/media/i', '/media/d'])
  expect(wrapper.text()).toContain('Вложение 2')
})
