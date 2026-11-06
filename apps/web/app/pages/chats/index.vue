<script setup lang="ts">
import LoadingState from '~/components/ui/LoadingState.vue'
import ChatList from '~/components/chat/ChatList.vue'
import NewDirectChatDialog from '~/components/chat/NewDirectChatDialog.vue'
import NewGroupDialog from '~/components/chat/NewGroupDialog.vue'
const chats = useChatsStore()
const { can } = useCan()
const creating = ref(false), startingDirect = ref(false)
await chats.fetch()
</script>

<template>
  <section aria-label="Чаты">
    <h1>Чаты</h1>
    <div class="chats-actions">
      <button v-if="can('people.view') && can('chats.dm')" type="button" class="ui-button ui-button--primary" data-test="new-message" @click="startingDirect = true">Новое сообщение</button>
      <button v-if="can('chats.create_groups')" type="button" class="ui-button ui-button--secondary" data-test="new-group" @click="creating = true">Новая группа</button>
    </div>
    <NewDirectChatDialog v-if="startingDirect && can('people.view') && can('chats.dm')" @close="startingDirect = false" />
    <NewGroupDialog v-if="creating && can('chats.create_groups')" @close="creating = false" />
    <LoadingState v-if="chats.loading" :label="chats.chats.length ? 'Обновляем чаты…' : 'Загружаем чаты…'" />
    <p v-if="chats.error || chats.connectionError" role="alert">{{ chats.error || chats.connectionError }} <button :disabled="chats.loading" @click="chats.retry()">Повторить</button></p>
    <ChatList v-if="chats.loaded || chats.chats.length" :chats="chats.chats" :show-empty="!chats.loading && !chats.error && !chats.connectionError" />
  </section>
</template>

<style scoped>
.chats-actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-3); margin-block: var(--ui-space-4); }
</style>
