// @vitest-environment nuxt
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MediaUploader from '~/components/MediaUploader.vue'

// Самопроверка брифа задачи 30: что видно при `failed` и при истечении 15
// секунд опроса — фото в обоих случаях не должно привязываться.
const get = vi.fn()
const post = vi.fn()
const put = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post, put }))

beforeEach(() => {
  [get, post, put].forEach(fn => fn.mockReset())
})

describe('media uploader failure paths', () => {
  it('shows an error and does not attach the photo when the upload itself fails', async () => {
    post.mockRejectedValue(Object.assign(new Error('failed'), { statusCode: 422, data: { message: 'Слишком большой файл.' } }))

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo' } })
    await uploader.vm.upload(new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(put).not.toHaveBeenCalled()
    expect(uploader.find('[data-test="media-error"]').text()).toContain('Слишком большой файл')
  })

  it('says the record is gone instead of the server text when the target no longer exists', async () => {
    post.mockResolvedValue({ data: { id: 'md1', status: 'ready' } })
    put.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 404, data: { message: 'No query results for model [App\\Modules\\Directory\\Models\\Person] p1' },
    }))

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/people/p1/photo' } })
    await uploader.vm.upload(new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(uploader.find('[data-test="media-error"]').text()).toBe('Запись не найдена — возможно, её удалили.')
  })

  it('stops polling and shows an error when processing fails, without attaching the photo', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue({ data: { id: 'md1', status: 'processing' } })
    get.mockResolvedValue({ data: { id: 'md1', status: 'failed' } })

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo' } })
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

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo' } })
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
