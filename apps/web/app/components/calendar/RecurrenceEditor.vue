<script setup lang="ts">
import { weekdays, recurrenceLabel, type Recurrence } from '~/utils/recurrence'
const props = defineProps<{ modelValue: Recurrence, disabled?: boolean, error?: string }>()
const id = useId()
const emit = defineEmits<{ 'update:modelValue': [rule: Recurrence] }>()
const type = ref(props.modelValue?.type ?? 'none')
const weekday = ref(props.modelValue?.weekday ?? 7)
const nth = ref<-1 | 1 | 2 | 3 | 4 | 5>(props.modelValue?.type === 'monthly_nth_weekday' ? props.modelValue.nth : 1)
const anchor = ref(props.modelValue?.type === 'biweekly' ? props.modelValue.anchor_date : '')
watch(() => props.modelValue, rule => {
  type.value = rule?.type ?? 'none'; weekday.value = rule?.weekday ?? weekday.value
  if (rule?.type === 'biweekly') anchor.value = rule.anchor_date
  if (rule?.type === 'monthly_nth_weekday') nth.value = rule.nth
}, { deep: true })
function rule(): Recurrence {
  const day = Number(weekday.value)
  return type.value === 'none' ? null : type.value === 'weekly' ? { type: 'weekly', weekday: day }
    : type.value === 'biweekly' ? { type: 'biweekly', weekday: day, anchor_date: anchor.value }
      : { type: 'monthly_nth_weekday', weekday: day, nth: Number(nth.value) as typeof nth.value }
}
function update() { emit('update:modelValue', rule()) }
</script>
<template>
  <fieldset :disabled="disabled" :aria-describedby="error ? `${id}-error` : undefined">
    <legend>Правило повторения</legend>
    <label class="ui-field">Повторение <select v-model="type" aria-label="Повторение" data-test="type" :aria-invalid="error ? 'true' : undefined" :aria-describedby="error ? `${id}-error` : undefined" @change="update"><option value="none">Без повторения</option><option value="weekly">Каждую неделю</option><option value="biweekly">Раз в две недели</option><option value="monthly_nth_weekday">День недели месяца</option></select></label>
    <label v-if="type !== 'none'" class="ui-field">День недели <select v-model.number="weekday" aria-label="День недели" data-test="weekday" @change="update"><option v-for="(day, index) in weekdays" :key="day" :value="index + 1">{{ day }}</option></select></label>
    <template v-if="type === 'biweekly'">
      <label class="ui-field">Опорная дата <input v-model="anchor" aria-label="Опорная дата" data-test="anchor" :aria-invalid="error ? 'true' : undefined" :aria-describedby="error ? `${id}-error` : undefined" type="date" required @input="update"></label>
      <p class="ui-hint">От ближайшего выбранного дня недели не раньше опорной даты отсчитываются две недели. События могут быть и раньше опорной даты.</p>
    </template>
    <label v-if="type === 'monthly_nth_weekday'" class="ui-field">По счёту <select v-model.number="nth" aria-label="По счёту" data-test="nth" @change="update"><option :value="1">Первый</option><option :value="2">Второй</option><option :value="3">Третий</option><option :value="4">Четвёртый</option><option :value="5">Пятый</option><option :value="-1">Последний</option></select></label>
    <p v-if="type === 'monthly_nth_weekday' && nth === 5" class="ui-hint">Месяцы без пятого выбранного дня пропускаются.</p>
    <p class="ui-hint" data-test="recurrence-summary" aria-live="polite">{{ recurrenceLabel(rule()) }}</p>
    <p v-if="error" :id="`${id}-error`" role="alert" class="ui-field-error">{{ error }}</p>
  </fieldset>
</template>
<style scoped>
fieldset { min-inline-size: 0; max-width: 100%; margin: 0; padding: 0; border: 0; display: grid; gap: var(--ui-space-4); overflow-wrap: anywhere; }
legend { max-width: 100%; padding: 0; margin-bottom: var(--ui-space-3); font-weight: 600; }
</style>
