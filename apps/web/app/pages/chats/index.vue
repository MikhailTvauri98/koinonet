<script setup lang="ts">
import LoadingState from '~/components/ui/LoadingState.vue'
import ChatList from '~/components/chat/ChatList.vue'
import NewGroupDialog from '~/components/chat/NewGroupDialog.vue'
const chats = useChatsStore()
const { can } = useCan()
const creating = ref(false)
await chats.fetch()
</script>

<template>
  <section aria-label="Чаты">
    <h1>Чаты</h1>
    <button v-if="can('chats.create_groups')" type="button" data-test="new-group" @click="creating = true">Новая группа</button>
    <NewGroupDialog v-if="creating && can('chats.create_groups')" @close="creating = false" />
    <LoadingState v-if="chats.loading" :label="chats.chats.length ? 'Обновляем чаты…' : 'Загружаем чаты…'" />
    <p v-if="chats.error || chats.connectionError" role="alert">{{ chats.error || chats.connectionError }} <button :disabled="chats.loading" @click="chats.retry()">Повторить</button></p>
    <ChatList v-if="chats.loaded || chats.chats.length" :chats="chats.chats" :show-empty="!chats.loading && !chats.error && !chats.connectionError" />
  </section>
</template>
