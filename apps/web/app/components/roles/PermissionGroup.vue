<script setup lang="ts">
import type { PermissionCatalogueEntry } from '~/utils/roles'

defineProps<{
  title: string
  permissions: PermissionCatalogueEntry[]
  modelValue: string[]
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

function toggle(key: string, current: string[], checked: boolean) {
  emit('update:modelValue', checked ? [...current, key] : current.filter(existing => existing !== key))
}
</script>

<template>
  <fieldset class="permission-group" :disabled="disabled">
    <legend>{{ title }}</legend>
    <label v-for="permission in permissions" :key="permission.key" :title="permission.description">
      <input
        type="checkbox" :checked="modelValue.includes(permission.key)"
        :data-test="`permission-${permission.key}`"
        @change="toggle(permission.key, modelValue, ($event.target as HTMLInputElement).checked)"
      >
      {{ permission.label }}
    </label>
  </fieldset>
</template>

<style scoped>
.permission-group { border: 0; padding: 0; margin: 0 0 1rem; min-width: 0; }
.permission-group legend { font-weight: 600; padding: 0; margin-bottom: 0.4rem; }
.permission-group label { display: flex; align-items: center; gap: 0.4rem; margin: 0.3rem 0; }
</style>
