<script setup lang="ts">
import ChatList from './ChatList.vue'
import NewDirectChatDialog from './NewDirectChatDialog.vue'
import NewGroupDialog from './NewGroupDialog.vue'
import LoadingState from '~/components/ui/LoadingState.vue'
const props = defineProps<{ selectedId?: string }>()
const chats = useChatsStore(), auth = useAuthStore(), { can } = useCan()
const search = ref(''), creating = ref(false), startingDirect = ref(false)
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('ru')
  return chats.chats.filter(chat => chat.title.toLocaleLowerCase('ru').includes(query))
})
watch(() => auth.sessionVersion, () => { search.value = ''; creating.value = false; startingDirect.value = false })
onMounted(() => { void chats.fetch() })
</script>

<template>
  <section class="chat-workspace" :class="{ 'chat-workspace--selected': props.selectedId }" aria-label="Чаты">
    <aside class="chat-workspace__list" aria-label="Список чатов">
      <div class="chat-workspace__tools">
        <h1>Чаты</h1>
        <div class="chats-actions">
          <button v-if="can('people.view') && can('chats.dm')" type="button" class="ui-button ui-button--primary" data-test="new-message" @click="startingDirect = true">Новое сообщение</button>
          <button v-if="can('chats.create_groups')" type="button" class="ui-button ui-button--secondary" data-test="new-group" @click="creating = true">Новая группа</button>
        </div>
        <label class="chat-workspace__search">Найти чат<input v-model="search" type="search" placeholder="Название чата"></label>
        <LoadingState v-if="chats.loading" :label="chats.chats.length ? 'Обновляем чаты…' : 'Загружаем чаты…'" />
        <p v-if="chats.error || chats.connectionError" role="alert">{{ chats.error || chats.connectionError }} <button type="button" :disabled="chats.loading" @click="chats.retry()">Повторить</button></p>
      </div>
      <ChatList v-if="chats.loaded || chats.chats.length" :chats="filtered" :selected-id="selectedId" :show-empty="!search.trim() && !chats.loading && !chats.error && !chats.connectionError" />
      <p v-if="search.trim() && !filtered.length && chats.loaded && !chats.loading && !chats.error && !chats.connectionError" class="chat-workspace__no-match" role="status">Чаты не найдены</p>
    </aside>
    <div class="chat-workspace__conversation">
      <slot><p class="chat-workspace__placeholder">Выберите чат, чтобы прочитать сообщения.</p></slot>
    </div>
    <NewDirectChatDialog v-if="startingDirect && can('people.view') && can('chats.dm')" @close="startingDirect = false" />
    <NewGroupDialog v-if="creating && can('chats.create_groups')" @close="creating = false" />
  </section>
</template>

<style scoped>
.chat-workspace { display: flex; flex: 1; min-width: 0; min-height: min-content; }
.chat-workspace__list { width: 100%; min-width: 0; }
.chat-workspace__tools { padding: min(1rem, 16px); }
h1 { margin: 0 0 var(--ui-space-3); font-size: 1.25rem; }
.chats-actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); margin-bottom: var(--ui-space-4); }
.chats-actions > button { flex: 1 1 auto; }
.chat-workspace__search { display: grid; gap: var(--ui-space-2); font-size: .875rem; color: var(--ui-text-muted); }
.chat-workspace__search input { width: 100%; min-width: 0; }
.chat-workspace__conversation { display: none; min-width: 0; min-height: min-content; }
.chat-workspace--selected > .chat-workspace__list { display: none; }
.chat-workspace--selected > .chat-workspace__conversation { display: flex; flex: 1; flex-direction: column; }
.chat-workspace__no-match { padding: min(1rem, 16px); }
.chat-workspace__placeholder { margin: auto; padding: 1rem; color: var(--ui-text-muted); text-align: center; }
[role='alert'] { color: var(--ui-danger); }
@media (min-width: 1024px) {
  .chat-workspace { display: grid; grid-template-columns: 300px minmax(0, 1fr); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); }
  .chat-workspace > .chat-workspace__list { display: block; width: auto; min-height: 0; overflow-y: auto; contain: size; border-right: 1px solid var(--ui-border); }
  .chat-workspace > .chat-workspace__conversation { display: flex; flex-direction: column; padding: min(.75rem, 12px); }
}
</style>
