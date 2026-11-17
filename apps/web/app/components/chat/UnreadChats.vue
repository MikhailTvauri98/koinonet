<script setup lang="ts">
import UiAvatar from '~/components/ui/UiAvatar.vue'
const chats = useChatsStore(), { formatMoment } = useChurchDate()
const unread = computed(() => chats.chats.filter(chat => chat.unread_count > 0).slice(0, 3))
const preview = (chat: (typeof unread.value)[number]) => {
  const message = chat.last_message
  if (!message) return 'Сообщений пока нет'
  if (message.deleted) return 'Сообщение удалено'
  return message.body_preview?.replace(/\s+/gu, ' ').trim() || 'Вложение'
}
if (!chats.loaded && !chats.loading) void chats.fetch()
</script>

<template>
  <section class="home-section home-section--chats" aria-label="Сообщения">
    <header class="home-section__header"><h2>Сообщения</h2><NuxtLink class="ui-button ui-button--quiet" to="/chats">Все чаты</NuxtLink></header>
    <p v-if="chats.loading" role="status">Загрузка чатов…</p>
    <p v-if="chats.error" role="alert">{{ chats.error }} <button type="button" class="ui-button" :disabled="chats.loading" @click="chats.retry()">Повторить</button></p>
    <ul v-if="unread.length" class="home-chats">
      <li v-for="chat in unread" :key="chat.id">
        <NuxtLink :to="`/chats/${chat.id}`" class="home-chat">
          <UiAvatar :id="chat.id" :name="chat.title" :photo-url="chat.avatar_url" size="sm" />
          <span class="home-chat__text"><strong>{{ chat.title }}</strong><span class="home-chat__preview">{{ preview(chat) }}</span></span>
          <time v-if="chat.last_message_at" :datetime="chat.last_message_at">{{ formatMoment(chat.last_message_at) }}</time>
          <span :data-test="`unread-${chat.id}`" class="home-chat__badge" :aria-label="`Непрочитанных: ${chat.unread_count}`">{{ chat.unread_count }}</span>
        </NuxtLink>
      </li>
    </ul>
    <p v-else-if="chats.loaded && !chats.loading && !chats.connectionError">Непрочитанных сообщений нет.</p>
  </section>
</template>

<style scoped>
.home-chats { list-style: none; margin: 0; padding: 0; }
.home-chat { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-1) var(--ui-space-3); min-height: 56px; padding: var(--ui-space-2) 0; border-bottom: 1px solid var(--ui-border); color: inherit; text-decoration: none; }
li:last-child .home-chat { border-bottom: 0; }
.home-chat:hover strong { text-decoration: underline; }
.home-chat__text { display: grid; flex: 1 1 8rem; min-width: 0; }
.home-chat__preview { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; line-clamp: 1; color: var(--ui-text-muted); font-size: .875rem; }
time { color: var(--ui-text-muted); font-size: .875rem; }
.home-chat__badge { min-width: 1.5rem; padding: 2px 8px; border-radius: 999px; background: var(--ui-accent); color: var(--ui-on-accent); font-size: .875rem; font-weight: 600; text-align: center; }
</style>
