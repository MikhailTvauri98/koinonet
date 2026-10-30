// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MediaUploader from '~/components/MediaUploader.vue'
import { grantPermissions } from '../support/permissions'

// Самопроверка брифа задачи 30: что видно при `failed` и при истечении 15
// секунд опроса — фото в обоих случаях не должно привязываться.
const get = vi.fn()
const post = vi.fn()
const put = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post, put }))

enableAutoUnmount(afterEach)

beforeEach(() => {
  [get, post, put].forEach(fn => fn.mockReset())
  // Загрузчик живёт на экранах вошедшего; без выясненной сессии middleware
  // при монтировании спросил бы `/auth/me` через тот же подменённый `get`.
  grantPermissions()
})

afterEach(() => {
  vi.useRealTimers()
})

// Ответ, который приходит тогда, когда тест решит.
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const file = () => new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })

describe('media uploader polling', () => {
  it('uploads a multi-file selection in order, emitting only ready IDs', async () => {
    post.mockResolvedValueOnce({ data: { id: 'first', status: 'ready' } }).mockResolvedValueOnce({ data: { id: 'second', status: 'ready' } })
    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'announcement', multiple: true, mediaIds: ['old'], label: 'Добавить вложения' } })
    const input = uploader.get('input')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file(), file()] })
    await input.trigger('change')
    await new Promise(resolve => setTimeout(resolve))
    expect(post).toHaveBeenCalledTimes(2)
    expect(uploader.emitted('update:mediaIds')).toEqual([[['old', 'first']], [['old', 'first', 'second']]])
    expect(put).not.toHaveBeenCalled()
  })
  it('returns ready announcement IDs without a direct attachment endpoint', async () => {
    post.mockResolvedValue({ data: { id: 'new', status: 'processing' } })
    get.mockResolvedValue({ data: { id: 'new', status: 'ready' } })
    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'announcement', multiple: true, mediaIds: ['old'], label: 'Добавить вложения' } })
    vi.useFakeTimers()
    await uploader.vm.upload(file())
    expect(uploader.emitted('update:mediaIds')).toBeUndefined()
    expect(uploader.emitted('busy')?.[0]).toEqual([true])
    await vi.advanceTimersByTimeAsync(1000)
    expect(uploader.emitted('update:mediaIds')).toEqual([[['old', 'new']]])
    expect(put).not.toHaveBeenCalled()
    expect((post.mock.calls[0]![1] as FormData).get('purpose')).toBe('announcement')
    expect(uploader.emitted('busy')?.at(-1)).toEqual([false])
  })

  it('reports announcement processing failures without emitting unready IDs', async () => {
    post.mockResolvedValue({ data: { id: 'new', status: 'failed' } })
    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'announcement', multiple: true, label: 'Добавить вложения' } })
    await uploader.vm.upload(file())
    expect(uploader.emitted('update:mediaIds')).toBeUndefined()
    expect(uploader.emitted('error')?.at(-1)?.[0]).toContain('обработать')
    expect(put).not.toHaveBeenCalled()
  })
  it('asks for the status again only after the previous answer arrived', async () => {
    post.mockResolvedValue({ data: { id: 'md1', status: 'processing' } })
    get.mockReturnValue(deferred().promise)

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo', label: 'Выбрать фото' } })
    vi.useFakeTimers()
    await uploader.vm.upload(file())
    await vi.advanceTimersByTimeAsync(5000)

    expect(get).toHaveBeenCalledTimes(1)
  })

  it('gives up after 15 seconds even while a status request hangs, and a late ready does not attach', async () => {
    const slow = deferred<unknown>()
    post.mockResolvedValue({ data: { id: 'md1', status: 'processing' } })
    get.mockReturnValue(slow.promise)

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo', label: 'Выбрать фото' } })
    vi.useFakeTimers()
    await uploader.vm.upload(file())
    await vi.advanceTimersByTimeAsync(15_000)

    expect(uploader.find('[data-test="media-error"]').text()).toContain('заняла слишком много времени')

    slow.resolve({ data: { id: 'md1', status: 'ready' } })
    await vi.advanceTimersByTimeAsync(1000)

    expect(put).not.toHaveBeenCalled()
  })

  it('does not attach a file whose status arrives after the uploader was closed', async () => {
    const slow = deferred<unknown>()
    post.mockResolvedValue({ data: { id: 'md1', status: 'processing' } })
    get.mockReturnValue(slow.promise)

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo', label: 'Выбрать фото' } })
    vi.useFakeTimers()
    await uploader.vm.upload(file())
    await vi.advanceTimersByTimeAsync(1000)
    uploader.unmount()

    slow.resolve({ data: { id: 'md1', status: 'ready' } })
    await vi.advanceTimersByTimeAsync(1000)

    expect(put).not.toHaveBeenCalled()
  })

  it('attaches exactly once when the status turns ready', async () => {
    post.mockResolvedValue({ data: { id: 'md1', status: 'processing' } })
    get.mockResolvedValueOnce({ data: { id: 'md1', status: 'processing' } })
      .mockResolvedValue({ data: { id: 'md1', status: 'ready' } })
    put.mockResolvedValue({ data: { photo_url: '/photo.webp' } })

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo', label: 'Выбрать фото' } })
    vi.useFakeTimers()
    await uploader.vm.upload(file())
    await vi.advanceTimersByTimeAsync(10_000)

    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith('/me/photo', { media_id: 'md1' })
  })
})

describe('media uploader failure paths', () => {
  it('shows an error and does not attach the photo when the upload itself fails', async () => {
    post.mockRejectedValue(Object.assign(new Error('failed'), { statusCode: 422, data: { message: 'Слишком большой файл.' } }))

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo', label: 'Выбрать фото' } })
    await uploader.vm.upload(new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(put).not.toHaveBeenCalled()
    expect(uploader.find('[data-test="media-error"]').text()).toContain('Слишком большой файл')
  })

  it('says the record is gone instead of the server text when the target no longer exists', async () => {
    post.mockResolvedValue({ data: { id: 'md1', status: 'ready' } })
    put.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 404, data: { message: 'No query results for model [App\\Modules\\Directory\\Models\\Person] p1' },
    }))

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/people/p1/photo', label: 'Выбрать фото' } })
    await uploader.vm.upload(new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(uploader.find('[data-test="media-error"]').text()).toBe('Запись не найдена — возможно, её удалили.')
  })

  it('stops polling and shows an error when processing fails, without attaching the photo', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue({ data: { id: 'md1', status: 'processing' } })
    get.mockResolvedValue({ data: { id: 'md1', status: 'failed' } })

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo', label: 'Выбрать фото' } })
    await uploader.vm.upload(new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }))
    await vi.advanceTimersByTimeAsync(1000)

    expect(put).not.toHaveBeenCalled()
    expect(uploader.find('[data-test="media-error"]').text()).toContain('Не удалось обработать файл')

    const callsAfterFailure = get.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(get.mock.calls.length).toBe(callsAfterFailure)
    vi.useRealTimers()
  })

  it('gives up after 15 seconds of polling and does not attach the photo', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue({ data: { id: 'md1', status: 'processing' } })
    get.mockResolvedValue({ data: { id: 'md1', status: 'processing' } })

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo', label: 'Выбрать фото' } })
    await uploader.vm.upload(new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }))
    await vi.advanceTimersByTimeAsync(15_000)

    expect(put).not.toHaveBeenCalled()
    expect(uploader.find('[data-test="media-error"]').text()).toContain('заняла слишком много времени')

    // Опрос остановлен: дальнейшее время не добавляет новых запросов.
    const callsAtTimeout = get.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(get.mock.calls.length).toBe(callsAtTimeout)
    vi.useRealTimers()
  })
})

it.each(['announcement', 'event'] as const)('retains old IDs for multiple %s attachments and rejects failed files', async (purpose) => {
  post.mockResolvedValueOnce({ data: { id: 'first', status: 'ready' } }).mockResolvedValueOnce({ data: { id: 'bad', status: 'failed' } })
  const uploader = await mountSuspended(MediaUploader, { props: { purpose, multiple: true, mediaIds: ['old'], label: 'Вложения' } })
  const input = uploader.get('input')
  expect(input.attributes('multiple')).toBeDefined()
  expect(input.attributes('accept')).toBeUndefined()
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file(), file()] })
  await input.trigger('change'); await new Promise(resolve => setTimeout(resolve))
  expect(uploader.emitted('update:mediaIds')).toEqual([[['old', 'first']]])
  expect(uploader.emitted('error')?.at(-1)?.[0]).toContain('обработать')
  expect(put).not.toHaveBeenCalled()
})
