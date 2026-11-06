<script setup lang="ts">
import { personStatuses, type Person, type PersonStatus } from '~/utils/people'
const nameId = useId()
const props = defineProps<{ person: Person }>()
const initials = computed(() => [props.person.last_name, props.person.first_name].map(part => part.slice(0, 1)).join(''))
</script>

<template>
  <li class="person-item" data-test="person-item">
    <NuxtLink :to="`/people/${person.id}`" class="person-item__open" :aria-labelledby="nameId">
      <img v-if="person.photo_url" :src="person.photo_url" alt="" width="44" height="44" loading="lazy">
      <span v-else class="person-item__placeholder" aria-hidden="true">{{ initials }}</span>
      <span class="person-item__body">
        <strong :id="nameId">{{ person.full_name }}</strong>
        <span class="person-item__details">
          <span>{{ personStatuses[person.status as PersonStatus] ?? person.status }}</span>
          <span v-if="!person.has_global_roles" class="person-item__badge">без ролей</span>
          <span v-if="person.archived" class="person-item__badge">В архиве</span>
          <span v-if="person.account_disabled">Аккаунт отключён</span>
        </span>
      </span>
      <span class="person-item__arrow" aria-hidden="true">›</span>
    </NuxtLink>
  </li>
</template>

<style scoped>
.person-item { min-width: 0; background: var(--ui-surface); }
.person-item + .person-item { border-top: 1px solid var(--ui-border); }
.person-item__open { display: flex; align-items: center; gap: var(--ui-space-3); min-height: 76px; padding: 1rem; color: var(--ui-text); text-decoration: none; overflow-wrap: anywhere; }
.person-item__open:hover { background: var(--ui-surface-muted); }
.person-item__open:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: -3px; }
.person-item img, .person-item__placeholder { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.person-item__placeholder { display: grid; place-items: center; background: var(--ui-accent-soft); color: var(--ui-accent); font-size: .875rem; }
.person-item__body { flex: 1; min-width: 0; display: grid; gap: var(--ui-space-1); }
.person-item__details { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); color: var(--ui-text-muted); font-size: .875rem; }
.person-item__badge { padding-inline: var(--ui-space-2); border-radius: 6px; background: var(--ui-surface-muted); }
.person-item__arrow { color: var(--ui-text-muted); flex-shrink: 0; }
</style>
