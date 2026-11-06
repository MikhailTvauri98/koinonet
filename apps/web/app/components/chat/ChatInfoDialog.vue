<script setup lang="ts">
import type { components } from '~~/types/api'
import UiDialog from '~/components/ui/UiDialog.vue'
import MuteMenu from './MuteMenu.vue'
const props = defineProps<{ chat: components['schemas']['ChatResource'], member: boolean, disabled: boolean, left?: boolean, archived?: boolean }>()
defineEmits<{ close: [], action: [next: 'members' | 'rename' | 'avatar' | 'leave' | 'archive'], mute: [hours?: number], unmute: [] }>()
const group = computed(() => props.chat.type === 'group' && !props.chat.archived && !props.archived && !props.left)
const manage = computed(() => group.value && props.chat.can_manage_members)
const kind = computed(() => ({ direct: 'Личный чат', group: 'Группа', ministry: 'Чат служения', event: 'Чат события' })[props.chat.type])
</script>
<template>
  <UiDialog :open="true" label="Сведения о чате" @close="$emit('close')">
    <header class="chat-info__heading"><div><h2>Сведения о чате</h2><p>{{ kind }}<span v-if="chat.archived || archived"> · В архиве</span></p></div></header>
    <p class="chat-info__title">{{ chat.title }}</p>
    <div class="chat-info__sections">
      <section v-if="chat.type !== 'direct'" aria-label="Состав чата">
        <button type="button" data-test="members" class="chat-info__row" :disabled="disabled" @click="$emit('action', 'members')"><span>{{ chat.type === 'group' ? 'Участники группы' : 'Состав чата' }}</span><span>{{ chat.members.length }} <span aria-hidden="true">›</span></span></button>
      </section>
      <MuteMenu v-if="member && !left" :until="chat.muted_until" :disabled="disabled" @mute="$emit('mute', $event)" @unmute="$emit('unmute')" />
      <section v-if="group" class="chat-info__actions" aria-label="Действия группы">
        <button v-if="manage" type="button" data-test="rename" :disabled="disabled" @click="$emit('action', 'rename')">Изменить название</button>
        <button v-if="manage" type="button" data-test="avatar" :disabled="disabled" @click="$emit('action', 'avatar')">Сменить аватар</button>
        <button v-if="member && !chat.is_owner" type="button" data-test="leave" :disabled="disabled" @click="$emit('action', 'leave')">Выйти из группы</button>
        <button v-if="chat.is_owner || manage" type="button" class="ui-button--danger" data-test="archive" :disabled="disabled" @click="$emit('action', 'archive')">Архивировать группу</button>
      </section>
      <slot name="menu" />
      <slot />
    </div>
    <template #actions><button type="button" @click="$emit('close')">Закрыть</button></template>
  </UiDialog>
</template>
<style scoped>
.chat-info__heading h2 { margin-bottom: .25rem; }
.chat-info__heading p { color: var(--ui-text-muted); font-size: .875rem; margin: 0; }
.chat-info__title { font-weight: 600; overflow-wrap: anywhere; }
.chat-info__sections { display: grid; gap: min(1rem, 16px); }
.chat-info__sections > section { padding-top: min(1rem, 16px); border-top: 1px solid var(--ui-border); }
.chat-info__row { display: flex; justify-content: space-between; align-items: center; gap: min(.75rem, 12px); width: 100%; text-align: left; }
.chat-info__row > span:first-child { min-width: 0; }
.chat-info__row > span:last-child { flex: 0 0 auto; color: var(--ui-text-muted); }
.chat-info__actions { display: grid; gap: min(.5rem, 8px); }
.chat-info__actions button { width: 100%; min-height: 44px; text-align: left; }
</style>
