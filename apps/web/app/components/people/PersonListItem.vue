<script setup lang="ts">
import { personStatuses, type Person, type PersonStatus } from '~/utils/people'

defineProps<{ person: Person }>()
</script>

<template>
  <li class="person-item" data-test="person-item">
    <img v-if="person.photo_url" :src="person.photo_url" :alt="`Фото: ${person.full_name}`" width="48" height="48" loading="lazy">
    <span v-else class="person-item__placeholder" aria-hidden="true">{{ person.first_name.slice(0, 1) }}</span>
    <div>
      <strong>{{ person.full_name }}</strong>
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
.person-item { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 0; border-bottom: 1px solid #d8dce2; overflow-wrap: anywhere; }
.person-item img, .person-item__placeholder { width: 3rem; height: 3rem; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.person-item__placeholder { display: grid; place-items: center; background: #edf1f6; color: #34445a; }
.person-item__details { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.3rem; color: #4b5563; font-size: 0.875rem; }
.person-item__badge { padding: 0 0.4rem; border-radius: 0.25rem; background: #edf1f6; }
</style>
