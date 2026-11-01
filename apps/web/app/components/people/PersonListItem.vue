<script setup lang="ts">
import { personStatuses, type Person, type PersonStatus } from '~/utils/people'

defineProps<{ person: Person }>()
</script>

<template>
  <li class="person-item" data-test="person-item">
    <img v-if="person.photo_url" :src="person.photo_url" :alt="`Фото: ${person.full_name}`" width="48" height="48" loading="lazy">
    <span v-else class="person-item__placeholder" aria-hidden="true">{{ person.first_name.slice(0, 1) }}</span>
    <div>
      <NuxtLink :to="`/people/${person.id}`"><strong>{{ person.full_name }}</strong></NuxtLink>
      <div class="person-item__details">
        <span>{{ personStatuses[person.status as PersonStatus] ?? person.status }}</span>
        <span v-if="!person.has_global_roles" class="person-item__badge">без ролей</span>
        <span v-if="person.archived" class="person-item__badge">В архиве</span>
        <span v-if="person.account_disabled">Аккаунт отключён</span>
      </div>
    </div>
  </li>
</template>

<style scoped>
.person-item { display: flex; align-items: center; gap: var(--ui-space-3); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); box-shadow: var(--ui-shadow); padding: min(var(--ui-space-4), 16px); overflow-wrap: anywhere; }
.person-item > div { min-width: 0; flex: 1; }
.person-item a { text-decoration: none; }
.person-item a:hover { text-decoration: underline; }
.person-item img, .person-item__placeholder { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.person-item__placeholder { display: grid; place-items: center; background: var(--ui-accent-soft); color: var(--ui-accent); font-weight: 600; }
.person-item__details { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); margin-top: var(--ui-space-1); color: var(--ui-text-muted); font-size: 0.875rem; }
.person-item__badge { padding: 0 var(--ui-space-2); border-radius: var(--ui-radius-sm); background: var(--ui-surface-muted); }
</style>
