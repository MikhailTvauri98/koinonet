<script setup lang="ts">
import { MINISTRY_COLORS, type MinistryColorKey } from '~/utils/ministryColor'

// Цвет никогда не единственный признак: у каждого образца видна русская подпись.
// Родные радиокнопки: стрелки двигают выбор внутри группы, Tab входит в неё один раз.
const props = defineProps<{ modelValue: MinistryColorKey | null, error?: string, disabled?: boolean, hideLegend?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: MinistryColorKey] }>()
const uid = useId()
const errorId = `${uid}-error`
const name = `ministry-color-${uid}`
const first = ref<HTMLInputElement[]>([])
defineExpose({ focus: () => (first.value.find(input => input.checked) ?? first.value[0])?.focus() })
</script>

<template>
  <fieldset class="color-field" role="radiogroup" :disabled="disabled" :aria-describedby="error ? errorId : undefined" :aria-invalid="error ? 'true' : undefined" data-test="ministry-color">
    <legend :class="{ 'visually-hidden': hideLegend }">Цвет служения</legend>
    <div class="color-field__options">
      <label v-for="color in MINISTRY_COLORS" :key="color.key" class="color-field__option" :class="{ 'color-field__option--checked': props.modelValue === color.key }" :style="{ '--swatch': `var(--ui-ministry-${color.key})` }">
        <input ref="first" type="radio" :name="name" :value="color.key" :checked="props.modelValue === color.key" :data-test="`color-${color.key}`" @change="emit('update:modelValue', color.key)">
        <span class="color-field__swatch" aria-hidden="true" />
        <span class="color-field__label">{{ color.label }}</span>
      </label>
    </div>
    <p v-if="error" :id="errorId" class="color-field__error" data-test="ministry-color-error">{{ error }}</p>
  </fieldset>
</template>

<style scoped>
.color-field { min-width: 0; border: 0; padding: 0; margin: 0; }
.color-field legend { padding: 0; margin-bottom: var(--ui-space-2); }
.color-field__options { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr)); gap: var(--ui-space-2); }
.color-field__option { position: relative; display: flex; align-items: center; gap: var(--ui-space-2); min-width: 0; min-height: 44px; padding: var(--ui-space-2) var(--ui-space-3); border: 1px solid var(--ui-border-strong); border-radius: var(--ui-radius-sm); background: var(--ui-surface); cursor: pointer; }
.color-field__option--checked { border-color: var(--ui-accent); background: var(--ui-accent-soft); font-weight: 600; }
/* Родная радиокнопка остаётся в порядке фокуса и занимает всю плитку, но не рисуется. */
.color-field__option input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.color-field__option:has(input:focus-visible) { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.color-field__swatch { flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--swatch); border: 2px solid var(--ui-surface); box-shadow: 0 0 0 1px var(--ui-border-strong); }
.color-field__label { min-width: 0; overflow-wrap: anywhere; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.color-field__error { margin: var(--ui-space-2) 0 0; color: var(--ui-danger); }
</style>
