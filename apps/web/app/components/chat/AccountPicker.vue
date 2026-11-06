<script setup lang="ts">
import type { Person } from '~/utils/people'
import PeoplePicker from '~/components/people/PeoplePicker.vue'
const props = withDefaults(defineProps<{ excluded?: string[], disabled?: boolean }>(), { excluded: () => [] })
const emit = defineEmits<{ selected: [ids: string[]] }>()
const auth = useAuthStore(), { can } = useCan()
const picker = ref<InstanceType<typeof PeoplePicker>>()
const selected = ref<Person[]>([])
const eligible = (person: Pick<Person, 'user_id' | 'has_account' | 'archived' | 'account_disabled'>) => !!person.user_id && person.has_account && !person.archived && !person.account_disabled
  && person.user_id !== auth.user?.id && !props.excluded.includes(person.user_id)
// excluded is a list of account IDs. Only the adapter knows that boundary;
// the shared picker always receives person IDs from real directory records.
const excludedIds = computed(() => [...new Set([
  ...selected.value.map(person => person.id),
  ...(picker.value?.people ?? []).filter(person => !eligible(person)).map(person => person.id),
])])
function publish() { emit('selected', selected.value.flatMap(person => person.user_id ? [person.user_id] : [])) }
function select(person: Person) {
  if (props.disabled || !can('people.view') || !eligible(person) || selected.value.some(item => item.id === person.id)) return
  selected.value = [...selected.value, person]; publish()
}
function remove(person: Person) {
  if (props.disabled) return
  selected.value = selected.value.filter(item => item.id !== person.id); publish()
}
watch(() => props.excluded, () => { selected.value = selected.value.filter(eligible); publish() }, { deep: true })
watch([() => auth.sessionVersion, () => can('people.view')], () => { selected.value = []; publish() }, { flush: 'sync' })
</script>
<template>
  <div class="account-picker">
    <ul v-if="selected.length" class="account-picker__selected" aria-label="Выбранные участники">
      <li v-for="person in selected" :key="person.id">
        <span>{{ person.full_name }}</span>
        <button type="button" class="ui-button ui-button--secondary" :disabled="disabled" :aria-label="`Убрать ${person.full_name}`" @click="remove(person)">Убрать</button>
      </li>
    </ul>
    <PeoplePicker ref="picker" mode="accounts" :excluded-ids="excludedIds" :disabled="disabled" @select="select" />
  </div>
</template>
<style scoped>
.account-picker { display: grid; gap: 12px; min-width: 0; }
.account-picker__selected { list-style: none; padding: 0 !important; margin: 0; display: grid; gap: 8px; }
.account-picker__selected li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px; border-radius: 8px; background: var(--ui-accent-soft); }
.account-picker__selected span { flex: 1 1 10rem; min-width: 0; overflow-wrap: anywhere; }
</style>
