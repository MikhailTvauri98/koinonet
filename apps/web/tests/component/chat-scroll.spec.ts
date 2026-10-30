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
