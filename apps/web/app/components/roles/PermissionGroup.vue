<script setup lang="ts">
import type { PermissionCatalogueEntry } from '~/utils/roles'

defineProps<{
  title: string
  permissions: PermissionCatalogueEntry[]
  modelValue: string[]
  disabled?: boolean
}>()
const groupId = useId()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

function toggle(key: string, current: string[], checked: boolean) {
  emit('update:modelValue', checked ? [...current, key] : current.filter(existing => existing !== key))
}
</script>

<template>
  <fieldset class="permission-group" :disabled="disabled">
    <legend>{{ title }}</legend>
    <label v-for="permission in permissions" :key="permission.key" class="ui-choice" :title="permission.description">
      <input
        type="checkbox" :checked="modelValue.includes(permission.key)"
        :data-test="`permission-${permission.key}`"
        :aria-labelledby="`${groupId}-${permission.key}-label`" :aria-describedby="`${groupId}-${permission.key}-description`"
        @change="toggle(permission.key, modelValue, ($event.target as HTMLInputElement).checked)"
      >
      <span><span :id="`${groupId}-${permission.key}-label`">{{ permission.label }}</span><small :id="`${groupId}-${permission.key}-description`">{{ permission.description }}</small></span>
    </label>
  </fieldset>
</template>

<style scoped>
.permission-group { border: 0; border-top: 1px solid var(--ui-border); padding: var(--ui-space-4) 0 0; margin: 0; min-width: 0; }
legend { font-weight: 650; padding: 0 var(--ui-space-2) 0 0; overflow-wrap: anywhere; max-width: 100%; }
label { display: flex; align-items: flex-start; gap: var(--ui-space-3); padding-block: var(--ui-space-3); cursor: pointer; }
input { flex-shrink: 0; margin-top: .3em; }
span { min-width: 0; overflow-wrap: anywhere; }
small { font-size: .875rem; display: block; color: var(--ui-text-muted); margin-top: var(--ui-space-1); }
</style>
