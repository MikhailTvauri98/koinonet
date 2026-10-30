<script setup lang="ts">
import type { SlotChoice, SlotDraft } from '~/utils/eventEditor'
const props = defineProps<{ modelValue: SlotDraft[], choices: SlotChoice[], disabled?: boolean, single?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [slots: SlotDraft[]] }>()
function update(index: number, values: Partial<SlotDraft>) { emit('update:modelValue', props.modelValue.map((slot, i) => i === index ? { ...slot, ...values } : slot)) }
function chooseMinistry(index: number, id: string) { update(index, { role_id: props.choices.find(m => m.id === id)?.roles[0]?.id ?? null }) }
function selectedMinistry(_index: number, slot: SlotDraft) { return props.choices.find(m => m.roles.some(r => r.id === slot.role_id))?.id ?? '' }
</script>
<template>
  <section aria-label="Редактор слотов">
    <fieldset v-for="(slot, index) in modelValue" :key="index" :disabled="disabled">
      <legend>Слот {{ index + 1 }}</legend>
      <label>Служение <select :value="selectedMinistry(index, slot)" @change="chooseMinistry(index, ($event.target as HTMLSelectElement).value)"><option value="">Свободный слот</option><option v-for="m in choices" :key="m.id" :value="m.id">{{ m.name }}</option></select></label>
      <label>Роль <select :value="slot.role_id ?? ''" :data-test="`slot-${index}-role`" @change="update(index, { role_id: ($event.target as HTMLSelectElement).value || null })"><option value="">Свободный слот</option><optgroup v-for="m in choices.filter(m => !selectedMinistry(index, slot) || m.id === selectedMinistry(index, slot))" :key="m.id" :label="m.name"><option v-for="r in m.roles" :key="r.id" :value="r.id">{{ r.name }}</option></optgroup></select></label>
      <label>Подпись <input :value="slot.label ?? ''" maxlength="100" :data-test="`slot-${index}-label`" @input="update(index, { label: ($event.target as HTMLInputElement).value || null })"></label>
      <label>Количество <input type="number" min="1" max="50" :value="slot.required_count" :data-test="`slot-${index}-count`" @input="update(index, { required_count: Number(($event.target as HTMLInputElement).value) })"></label>
      <button v-if="!single" type="button" @click="emit('update:modelValue', modelValue.filter((_, i) => i !== index))">Убрать слот</button>
    </fieldset>
    <button v-if="!single && modelValue.length < 30" type="button" data-test="add-slot" :disabled="disabled" @click="emit('update:modelValue', [...modelValue, { role_id: null, label: null, required_count: 1 }])">Добавить слот</button>
  </section>
</template>
<style scoped>fieldset { margin: 1rem 0; } label { display: block; margin: .5rem 0; } input, select { max-width: 100%; padding: .5rem; } button { padding: .5rem; }</style>
