<script setup lang="ts">
const auth = useAuthStore()
const { can } = useCan()

// Та же логика видимости, что в AppNav.vue: см. комментарий там про
// отсутствие отдельного права на список служений в каталоге.
const hasMinistries = computed(() =>
  can('ministries.view_all') || can('ministries.manage_all') || Object.keys(auth.permissions.ministries).length > 0,
)
</script>

<template>
  <div class="home-page">
    <h1>Здравствуйте, {{ auth.person?.first_name }}!</h1>

    <ul class="home-page__links">
      <li v-if="can('people.view')">
        <NuxtLink to="/people">Справочник</NuxtLink>
      </li>
      <li v-if="hasMinistries">
        <NuxtLink to="/ministries">Служения</NuxtLink>
      </li>
      <li>
        <NuxtLink to="/settings/profile">Профиль</NuxtLink>
      </li>
    </ul>
  </div>
</template>
