<script setup lang="ts">
import type { Member } from '~/utils/ministries'
const props = defineProps<{ member: Member }>()
const emit = defineEmits<{ open: [member: Member] }>()
const initials = computed(() => props.member.full_name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('') || '?')
</script>

<template>
  <li class="member-row" data-test="member-row">
    <button type="button" class="member-row__open" data-test="open-member" @click="emit('open', member)">
      <img v-if="member.photo_url" :src="member.photo_url" alt="" width="44" height="44" loading="lazy">
      <span v-else class="member-row__placeholder" aria-hidden="true">{{ initials }}</span>
      <span class="member-row__body">
        <strong :class="{ 'member-row__hidden-name': !member.full_name }">{{ member.full_name || 'Имя скрыто' }}</strong>
        <span class="member-row__roles">{{ member.roles.map(role => role.name).join(' · ') || 'Без ролей' }}</span>
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
.member-row img, .member-row__placeholder { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.member-row__placeholder { display: grid; place-items: center; background: var(--ui-accent-soft); color: var(--ui-accent); font-size: .875rem; }
.member-row__body { display: grid; gap: var(--ui-space-1); flex: 1; min-width: 0; }
.member-row__roles, .member-row__hidden-name { color: var(--ui-text-muted); }
.member-row__roles { font-size: .875rem; }
.member-row__arrow { color: var(--ui-text-muted); flex-shrink: 0; }
</style>
