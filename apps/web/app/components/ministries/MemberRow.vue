<script setup lang="ts">
import UiAvatar from '~/components/ui/UiAvatar.vue'
import type { Member } from '~/utils/ministries'
const props = defineProps<{ member: Member, defaultRoleId?: string | null }>()
const emit = defineEmits<{ open: [member: Member] }>()
// Роль по умолчанию есть у каждого, поэтому она шум, если у человека есть другие; единственную роль показываем.
const roleNames = computed(() => {
  const others = props.member.roles.filter(role => role.id !== props.defaultRoleId)
  return (others.length ? others : props.member.roles).map(role => role.name).join(' · ')
})
</script>

<template>
  <li class="member-row" data-test="member-row">
    <button type="button" class="member-row__open" data-test="open-member" @click="emit('open', member)">
      <UiAvatar :id="member.person_id" :name="member.full_name" :photo-url="member.photo_url" size="md" decorative />
      <span class="member-row__body">
        <strong :class="{ 'member-row__hidden-name': !member.full_name }">{{ member.full_name || 'Имя скрыто' }}</strong>
        <span class="member-row__roles">{{ roleNames || 'Без ролей' }}</span>
      </span>
      <span class="member-row__arrow" aria-hidden="true">›</span>
    </button>
  </li>
</template>

<style scoped>
.member-row + .member-row { border-top: 1px solid var(--ui-border); }
.member-row__open { width: 100%; min-height: 76px; display: flex; align-items: center; gap: var(--ui-space-3); padding: 1rem; border: 0; border-radius: 0; background: transparent; color: var(--ui-text); text-align: left; font: inherit; cursor: pointer; overflow-wrap: anywhere; }
.member-row__open:hover { background: var(--ui-surface-muted); }
.member-row__open:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: -3px; }
.member-row__body { display: grid; gap: var(--ui-space-1); flex: 1; min-width: 0; }
.member-row__roles, .member-row__hidden-name { color: var(--ui-text-muted); }
.member-row__roles { font-size: .875rem; }
.member-row__arrow { color: var(--ui-text-muted); flex-shrink: 0; }
</style>
