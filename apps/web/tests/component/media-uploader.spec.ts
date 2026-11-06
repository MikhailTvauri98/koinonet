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

it('connects a failed file selection to its error and clears the association on retry', async () => {
  post.mockResolvedValueOnce({ data: { id: 'failed', status: 'failed' } })
  const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'event', label: 'Прикрепить медиафайлы' } })
  await uploader.vm.upload(file())
  const error = uploader.get('[role="alert"]')
  expect(error.text()).toContain('обработать')
  expect(error.attributes('id')).toBeTruthy()
  for (const control of [uploader.get('button[data-test="choose-file"]'), uploader.get('input[type="file"]')]) {
    expect(control.attributes('aria-describedby')).toBe(error.attributes('id'))
    expect(control.attributes('aria-invalid')).toBe('true')
  }
  post.mockResolvedValueOnce({ data: { id: 'ready', status: 'ready' } })
  await uploader.vm.upload(file())
  expect(uploader.find('[role="alert"]').exists()).toBe(false)
  expect(uploader.get('button[data-test="choose-file"]').attributes('aria-describedby')).toBeUndefined()
})

describe('media uploader polling', () => {
  it('previews message attachments before sending and removes ready IDs without attaching directly', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    post.mockResolvedValue({ data: { id: 'message-file', status: 'ready' } })
    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'message', multiple: true, label: 'Прикрепить файл' } })
    await uploader.vm.upload(file())
    expect(uploader.get('img').attributes('src')).toBe('blob:preview')
    expect(uploader.text()).toContain('photo.jpg')
    expect(uploader.emitted('update:mediaIds')?.at(-1)).toEqual([['message-file']])
    expect(put).not.toHaveBeenCalled()
    await uploader.get('button[aria-label="Убрать photo.jpg"]').trigger('click')
    expect(uploader.emitted('update:mediaIds')?.at(-1)).toEqual([[]])
    expect(revoke).toHaveBeenCalledWith('blob:preview')
    create.mockRestore(); revoke.mockRestore()
  })
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

it('provides a native file-picker button and rejects selection while disabled or busy', async () => {
  const pending = deferred<unknown>()
  post.mockReturnValue(pending.promise)
  const w = await mountSuspended(MediaUploader, { props: { purpose: 'event', label: 'Прикрепить файл', disabled: true } })
  expect(w.get('button[data-test="choose-file"]').attributes('disabled')).toBeDefined()
  const input = w.get('input')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file()] })
  await input.trigger('change')
  expect(post).not.toHaveBeenCalled()
  await w.setProps({ disabled: false })
  await input.trigger('change')
  expect(w.get('button[data-test="choose-file"]').attributes('disabled')).toBeDefined()
  expect(w.get('button[data-test="choose-file"]').text()).toBe('Загружается…')
  await input.trigger('change')
  expect(post).toHaveBeenCalledTimes(1)
  pending.resolve({ data: { id: 'ready', status: 'ready' } })
})
it('discards an in-flight upload after losing permission', async () => {
  const pending = deferred<unknown>()
  post.mockReturnValue(pending.promise)
  const w = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo', label: 'Выбрать фото' } })
  const uploading = w.vm.upload(file())
  await w.setProps({ disabled: true })
  pending.resolve({ data: { id: 'ready', status: 'ready' } })
  await uploading
  expect(put).not.toHaveBeenCalled()
  expect(w.emitted('busy')?.at(-1)).toEqual([false])
})

it('retains ready previews while selection is temporarily disabled', async () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:kept')
  post.mockResolvedValue({ data: { id: 'kept', status: 'ready' } })
  const w = await mountSuspended(MediaUploader, { props: { purpose: 'message', label: 'Прикрепить файл' } })
  await w.vm.upload(file())
  await w.setProps({ disabled: true })
  expect(w.get('img').attributes('src')).toBe('blob:kept')
  expect(w.get('button[aria-label="Убрать photo.jpg"]').attributes('disabled')).toBeDefined()
  await w.setProps({ disabled: false })
  await w.get('button[aria-label="Убрать photo.jpg"]').trigger('click')
  expect(w.emitted('update:mediaIds')?.at(-1)).toEqual([[]])
  create.mockRestore()
})
