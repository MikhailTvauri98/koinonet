<script setup lang="ts">
import type { SlotChoice, SlotDraft } from '~/utils/eventEditor'
const props = defineProps<{ modelValue: SlotDraft[], choices: SlotChoice[], disabled?: boolean, single?: boolean, fieldErrors?: Record<string, string[]> }>()
const emit = defineEmits<{ 'update:modelValue': [slots: SlotDraft[]] }>()
const id = useId()
function update(index: number, values: Partial<SlotDraft>) { emit('update:modelValue', props.modelValue.map((slot, i) => i === index ? { ...slot, ...values } : slot)) }
function chooseMinistry(index: number, value: string) { update(index, { role_id: props.choices.find(m => m.id === value)?.roles[0]?.id ?? null }) }
function selectedMinistry(slot: SlotDraft) { return props.choices.find(m => m.roles.some(r => r.id === slot.role_id))?.id ?? '' }
function error(index: number, field: string) { return props.fieldErrors?.[`slots.${index}.${field}`]?.join(' ') }
function attrs(index: number, field: string) { return { 'aria-invalid': error(index, field) ? 'true' as const : undefined, 'aria-describedby': error(index, field) ? `${id}-${index}-${field}` : undefined } }
</script>
<template>
  <section class="slot-editor" aria-label="Редактор слотов">
    <p v-if="fieldErrors?.slots" role="alert" class="ui-field-error">{{ fieldErrors.slots.join(' ') }}</p>
    <fieldset v-for="(slot, index) in modelValue" :key="index" :disabled="disabled" class="slot-editor__row">
      <legend>Слот {{ index + 1 }}</legend>
      <div class="ui-form-grid">
        <label class="ui-field">Служение <select :value="selectedMinistry(slot)" @change="chooseMinistry(index, ($event.target as HTMLSelectElement).value)"><option value="">Свободный слот</option><option v-for="m in choices" :key="m.id" :value="m.id">{{ m.name }}</option></select></label>
        <label class="ui-field">Роль <select :value="slot.role_id ?? ''" :data-test="`slot-${index}-role`" aria-label="Роль" v-bind="attrs(index, 'role_id')" @change="update(index, { role_id: ($event.target as HTMLSelectElement).value || null })"><option value="">Свободный слот</option><optgroup v-for="m in choices.filter(m => !selectedMinistry(slot) || m.id === selectedMinistry(slot))" :key="m.id" :label="m.name"><option v-for="r in m.roles" :key="r.id" :value="r.id">{{ r.name }}</option></optgroup></select><span v-if="error(index, 'role_id')" :id="`${id}-${index}-role_id`" class="ui-field-error" role="alert">{{ error(index, 'role_id') }}</span></label>
        <label class="ui-field">Подпись <input :value="slot.label ?? ''" maxlength="100" :data-test="`slot-${index}-label`" aria-label="Подпись" v-bind="attrs(index, 'label')" @input="update(index, { label: ($event.target as HTMLInputElement).value || null })"><span v-if="error(index, 'label')" :id="`${id}-${index}-label`" class="ui-field-error" role="alert">{{ error(index, 'label') }}</span></label>
        <label class="ui-field">Количество <input type="number" min="1" max="50" :value="slot.required_count" :data-test="`slot-${index}-count`" aria-label="Количество" v-bind="attrs(index, 'required_count')" @input="update(index, { required_count: Number(($event.target as HTMLInputElement).value) })"><span v-if="error(index, 'required_count')" :id="`${id}-${index}-required_count`" class="ui-field-error" role="alert">{{ error(index, 'required_count') }}</span></label>
      </div>
      <button v-if="!single" type="button" class="ui-button" @click="emit('update:modelValue', modelValue.filter((_, i) => i !== index))">Убрать слот</button>
    </fieldset>
    <button v-if="!single && modelValue.length < 30" type="button" class="ui-button" data-test="add-slot" :disabled="disabled" @click="emit('update:modelValue', [...modelValue, { role_id: null, label: null, required_count: 1 }])">Добавить слот</button>
  </section>
</template>
<style scoped>
.slot-editor { min-width: 0; max-width: 100%; overflow-wrap: anywhere; display: grid; gap: var(--ui-space-4); }
.slot-editor__row { min-inline-size: 0; max-width: 100%; margin: 0; padding: min(var(--ui-space-4), 16px); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-sm); }
legend { max-width: 100%; padding: 0 var(--ui-space-1); font-weight: 600; }
.slot-editor__row > button { margin-top: var(--ui-space-4); }
.slot-editor > button { justify-self: start; }
@media (max-width: 479px) { .slot-editor__row { padding: 12px; } }
</style>
