<script setup lang="ts">
import type { Person } from '~/utils/people'

defineProps<{ contacts: NonNullable<Person['contacts']> }>()
</script>

<template>
  <section data-test="contacts">
    <h2>Контакты</h2>
    <dl>
      <template v-if="contacts.phone">
        <dt>Телефон</dt><dd><a :href="`tel:${contacts.phone}`">{{ contacts.phone }}</a></dd>
      </template>
      <template v-if="contacts.email">
        <dt>Электронная почта</dt><dd><a :href="`mailto:${contacts.email}`">{{ contacts.email }}</a></dd>
      </template>
      <template v-if="contacts.birth_date">
        <dt>Дата рождения</dt><dd>{{ contacts.birth_date.split('-').reverse().join('.') }}</dd>
      </template>
    </dl>
    <p v-if="!contacts.phone && !contacts.email && !contacts.birth_date">Контакты не заполнены.</p>
  </section>
</template>

<style scoped>
dt { color: #4b5563; margin-top: 0.6rem; }
dd { margin: 0.2rem 0 0; overflow-wrap: anywhere; }
</style>
