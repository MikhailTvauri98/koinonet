<script setup lang="ts">
import { weekdays, type Recurrence } from '~/utils/recurrence'
const props = defineProps<{ modelValue: Recurrence, disabled?: boolean }>()
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
function update() {
  const day = Number(weekday.value)
  emit('update:modelValue', type.value === 'none' ? null : type.value === 'weekly' ? { type: 'weekly', weekday: day }
    : type.value === 'biweekly' ? { type: 'biweekly', weekday: day, anchor_date: anchor.value }
      : { type: 'monthly_nth_weekday', weekday: day, nth: Number(nth.value) as typeof nth.value })
}
</script>
<template>
  <fieldset :disabled="disabled">
    <legend>Правило повторения</legend>
    <label>Повторение <select v-model="type" data-test="type" @change="update"><option value="none">Без повторения</option><option value="weekly">Каждую неделю</option><option value="biweekly">Раз в две недели</option><option value="monthly_nth_weekday">День недели месяца</option></select></label>
    <label v-if="type !== 'none'">День недели <select v-model.number="weekday" data-test="weekday" @change="update"><option v-for="(day, index) in weekdays" :key="day" :value="index + 1">{{ day }}</option></select></label>
    <template v-if="type === 'biweekly'">
      <label>Опорная дата <input v-model="anchor" data-test="anchor" type="date" required @input="update"></label>
      <p>От ближайшего выбранного дня недели не раньше опорной даты отсчитываются две недели. События могут быть и раньше опорной даты.</p>
    </template>
    <label v-if="type === 'monthly_nth_weekday'">По счёту <select v-model.number="nth" data-test="nth" @change="update"><option :value="1">Первый</option><option :value="2">Второй</option><option :value="3">Третий</option><option :value="4">Четвёртый</option><option :value="5">Пятый</option><option :value="-1">Последний</option></select></label>
    <p v-if="type === 'monthly_nth_weekday' && nth === 5">Месяцы без пятого выбранного дня пропускаются.</p>
  </fieldset>
</template>
<style scoped>
fieldset { min-inline-size: 0; max-width: 100%; margin: var(--ui-space-4) 0; padding: var(--ui-space-3); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-sm); overflow-wrap: anywhere; }
legend { max-width: 100%; padding: 0 var(--ui-space-1); font-weight: 600; }
label { display: block; margin: var(--ui-space-3) 0; }
input, select { display: block; min-width: 0; max-width: 100%; width: 100%; }
p { color: var(--ui-text-muted); }
</style>
