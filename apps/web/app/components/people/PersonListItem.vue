<script setup lang="ts">
import { personStatuses, type Person, type PersonStatus } from '~/utils/people'
import UiAvatar from '~/components/ui/UiAvatar.vue'
const nameId = useId()
defineProps<{ person: Person }>()
</script>

<template>
  <li class="person-item" data-test="person-item">
    <NuxtLink :to="`/people/${person.id}`" class="person-item__open" :aria-labelledby="nameId">
      <UiAvatar :id="person.id" :name="person.short_name ?? person.full_name" :photo-url="person.photo_url" decorative />
      <span class="person-item__body">
        <strong :id="nameId">{{ person.full_name }}</strong>
        <span class="person-item__details">
          <span>{{ personStatuses[person.status as PersonStatus] ?? person.status }}</span>
          <span v-if="person.archived" class="person-item__badge">В архиве</span>
          <span v-if="person.account_disabled">Аккаунт отключён</span>
        </span>
      </span>
      <span class="person-item__arrow" aria-hidden="true">›</span>
    </NuxtLink>
  </li>
</template>

<style scoped>
.person-item { container-type: inline-size; min-width: 0; background: var(--ui-surface); }
.person-item + .person-item { border-top: 1px solid var(--ui-border); }
.person-item__open { display: flex; align-items: center; gap: var(--ui-space-3); min-height: 76px; padding: 1rem; color: var(--ui-text); text-decoration: none; overflow-wrap: anywhere; }
.person-item__open:hover { background: var(--ui-surface-muted); }
.person-item__open:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: -3px; }
.person-item__body { flex: 1; min-width: 0; display: grid; gap: var(--ui-space-1); }
.person-item__details { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); color: var(--ui-text-muted); font-size: .875rem; }
.person-item__badge { padding-inline: var(--ui-space-2); border-radius: 6px; background: var(--ui-surface-muted); }
.person-item__arrow { color: var(--ui-text-muted); flex-shrink: 0; }
@container (max-width: 16rem) {
  .person-item__open { display: grid; grid-template-columns: 44px minmax(0, 1fr); }
  .person-item__body { grid-column: 1 / -1; grid-row: 2; }
  .person-item__arrow { grid-column: 2; grid-row: 1; justify-self: end; }
}
</style>
