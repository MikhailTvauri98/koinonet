<script setup lang="ts">
// Вкладки служения — одни на карточку, состав и роли. «Роли» видит только
// тот, кто читает список ролей служения: носитель roles.manage или
// members.manage в этом служении (docs/architecture.md, 6.1); остальным
// вкладка вела бы на отказ.
const props = defineProps<{ ministryId: string }>()
const { canIn } = useCan()

const base = computed(() => `/ministries/${encodeURIComponent(props.ministryId)}`)
const canSeeRoles = computed(() => canIn(props.ministryId, 'roles.manage') || canIn(props.ministryId, 'members.manage'))
</script>

<template>
  <nav aria-label="Разделы служения" class="ministry-tabs">
    <NuxtLink :to="base" exact-active-class="ministry-tabs__active">Обзор</NuxtLink>
    <NuxtLink :to="`${base}/members`" exact-active-class="ministry-tabs__active">Участники</NuxtLink>
    <NuxtLink :to="`${base}/events`" exact-active-class="ministry-tabs__active">События</NuxtLink>
    <NuxtLink :to="`${base}/announcements`" exact-active-class="ministry-tabs__active">Объявления</NuxtLink>
    <NuxtLink v-if="canSeeRoles" :to="`${base}/roles`" exact-active-class="ministry-tabs__active">Роли</NuxtLink>
  </nav>
</template>

<style scoped>
.ministry-tabs { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin: 1rem 0; }
.ministry-tabs__active { font-weight: 600; }
</style>
