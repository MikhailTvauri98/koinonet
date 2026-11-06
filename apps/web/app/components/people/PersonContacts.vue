<script setup lang="ts">
import type { Person } from '~/utils/people'
defineProps<{ contacts: NonNullable<Person['contacts']> }>()
</script>

<template>
  <section class="person-contacts" data-test="contacts">
    <h2>Контакты</h2>
    <dl>
      <template v-if="contacts.phone"><dt>Телефон</dt><dd><a :href="`tel:${contacts.phone}`">{{ contacts.phone }}</a></dd></template>
      <template v-if="contacts.email"><dt>Электронная почта</dt><dd><a :href="`mailto:${contacts.email}`">{{ contacts.email }}</a></dd></template>
      <template v-if="contacts.birth_date"><dt>Дата рождения</dt><dd>{{ contacts.birth_date.split('-').reverse().join('.') }}</dd></template>
    </dl>
    <p v-if="!contacts.phone && !contacts.email && !contacts.birth_date" class="ui-hint">Контакты не заполнены.</p>
  </section>
</template>

<style scoped>
.person-contacts { padding: min(var(--ui-space-6), 24px); border: 1px solid var(--ui-border); border-radius: 14px; background: var(--ui-surface); min-width: 0; }
h2 { margin: 0 0 var(--ui-space-4); font-size: 1.25rem; }
dl, p { margin: 0; }
dt { color: var(--ui-text-muted); font-size: .875rem; }
dd { margin: var(--ui-space-1) 0 var(--ui-space-4); overflow-wrap: anywhere; }
dd:last-child { margin-bottom: 0; }
.ui-hint { color: var(--ui-text-muted); }
@media (max-width: 479px) { .person-contacts { padding: 16px; } }
</style>
