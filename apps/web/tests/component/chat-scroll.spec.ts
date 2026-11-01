// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import MessageList from '~/components/chat/MessageList.vue'
import type { ChatMessage } from '~/composables/useChatMessages'

const message = (id: string): ChatMessage => ({ id, chat_id: 'c1', created_at: '2026-12-01T10:00:00.000001Z', cursor: 'opaque', body: id, sender: null, reply_to: null, attachments: [], deleted: false, edited_at: null })
it('keeps the visible message anchored when older prepend overlaps a live append', async () => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  const list = await mountSuspended(MessageList, { props: { messages: [message('a'), message('b')], hasOlder: true, loadingOlder: false, writable: true, moderate: false, pinnedIds: [] } })
  await flushPromises()
  const scroller = list.get('[aria-label="История сообщений"]').element as HTMLElement
  let height = 400
  Object.defineProperty(scroller, 'scrollHeight', { get: () => height })
  scroller.scrollTop = 50
  vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => ({ top: 0, bottom: 200, height: 200 }) as DOMRect)
  const a = list.get('article').element
  let prepended = 0
  vi.spyOn(a, 'getBoundingClientRect').mockImplementation(() => ({ top: prepended - scroller.scrollTop, bottom: prepended - scroller.scrollTop + 100, height: 100 }) as DOMRect)
  await list.get('button').trigger('click')
  await list.setProps({ loadingOlder: true })
  height = 480
  await list.setProps({ messages: [message('a'), message('b'), message('z')] }); await flushPromises()
  height = 580; prepended = 100
  await list.setProps({ messages: [message('old'), message('a'), message('b'), message('z')], loadingOlder: false }); await flushPromises()
  expect(scroller.scrollTop).toBe(150)
  list.unmount(); vi.unstubAllGlobals()
})

it('keeps the latest message at the bottom when the history viewport shrinks, without moving a reader of older messages', async () => {
  const observers: { callback: ResizeObserverCallback, targets: Element[] }[] = []
  vi.stubGlobal('ResizeObserver', class {
    item: { callback: ResizeObserverCallback, targets: Element[] }
    constructor(callback: ResizeObserverCallback) { this.item = { callback, targets: [] }; observers.push(this.item) }
    observe(target: Element) { this.item.targets.push(target) }
    disconnect() {}
  })
  const list = await mountSuspended(MessageList, { props: { messages: [message('a'), message('b')], hasOlder: false, loadingOlder: false, writable: true, moderate: false, pinnedIds: [] } })
  await flushPromises()
  const scroller = list.get('[aria-label="История сообщений"]').element as HTMLElement
  Object.defineProperty(scroller, 'scrollHeight', { get: () => 800 })
  let clientHeight = 300
  Object.defineProperty(scroller, 'clientHeight', { get: () => clientHeight })
  scroller.scrollTop = 500
  await list.get('[aria-label="История сообщений"]').trigger('scroll')
  const observer = observers.find(o => o.targets.includes(scroller))
  expect(observer, 'history must respond to its real available height').toBeDefined()
  observer!.callback([], {} as ResizeObserver)
  scroller.scrollTop = 500
  clientHeight = 96
  // Chromium can deliver the resize-induced scroll before ResizeObserver.
  // That is not a reader choosing to leave the newest message.
  await list.get('[aria-label="История сообщений"]').trigger('scroll')
  observer!.callback([], {} as ResizeObserver)
  await flushPromises()
  expect(scroller.scrollTop).toBe(800)
  scroller.scrollTop = 100
  await list.get('[aria-label="История сообщений"]').trigger('scroll')
  clientHeight = 80
  await list.get('[aria-label="История сообщений"]').trigger('scroll')
  observer!.callback([], {} as ResizeObserver)
  await flushPromises()
  expect(scroller.scrollTop).toBe(100)
  list.unmount(); vi.unstubAllGlobals()
})

it('keeps an open message menu attached to its original message after a live append', async () => {
  const observers: { callback: IntersectionObserverCallback, targets: Element[], options?: IntersectionObserverInit }[] = []
  vi.stubGlobal('IntersectionObserver', class {
    item: typeof observers[number]
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) { this.item = { callback, targets: [], options }; observers.push(this.item) }
    observe(target: Element) { this.item.targets.push(target) }
    disconnect() { this.item.targets = [] }
  })
  const original = message('a'), incoming = message('b')
  const list = await mountSuspended(MessageList, { attachTo: document.body, props: { messages: [original], hasOlder: false, loadingOlder: false, writable: true, moderate: false, pinnedIds: [] } })
  try {
    await flushPromises()
    await list.get('[data-test=actions-a]').trigger('click')
    await flushPromises()
    expect(list.find('dialog[open]').exists()).toBe(true)
    await list.setProps({ messages: [original, incoming] })
    await flushPromises()
    expect(list.find('dialog[open]').exists(), 'a new last row must not destroy the old row menu').toBe(true)
    expect(list.get('[data-test=latest-message] article').attributes('data-message-id')).toBe('b')
    const latest = list.get('[data-test=latest-message]').element
    const viewportObserver = observers.findLast(observer => observer.options?.root === null && observer.targets.includes(latest))
    expect(viewportObserver, 'the new latest row remains observed even when the old ref clears').toBeDefined()
    viewportObserver!.callback([{ target: latest, isIntersecting: true, intersectionRect: { width: 100, height: 100 } } as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(list.emitted('visible')?.at(-1)).toEqual(['b', true])
    await list.get('[data-test=reply-a]').trigger('click')
    await flushPromises()
    expect(list.emitted('reply')).toEqual([[original]])
    expect(list.find('dialog[open]').exists()).toBe(false)
  } finally {
    list.unmount(); vi.unstubAllGlobals()
  }
})
