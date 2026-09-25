<script setup lang="ts">
import type { Person } from '~/utils/people'
import { ministriesErrorMessage, type Member } from '~/utils/ministries'

const props = defineProps<{ ministryId: string }>()
const emit = defineEmits<{ added: [member: Member], close: [] }>()
const api = useApi()
const dialog = ref<HTMLDialogElement>()
const search = ref('')
const results = ref<Person[]>([])
const searching = ref(false)
const searchError = ref('')
const adding = ref(false)
const addError = ref('')
let searchVersion = 0
// Диалог можно закрыть (или экран может уйти) пока запрос ещё летит —
// приём из AccessLinkDialog.vue: не пишем в состояние и не эмитим наружу
// после того, как компонент размонтирован.
let active = true
onBeforeUnmount(() => { active = false })

// Без задержки в 300 мс, в отличие от справочника людей (pages/people/index.vue):
// диалог маленький, результатов немного, а лишний ход к серверу за один
// символ не стоит сложности с таймером внутри модального окна.
watch(search, async (value) => {
  const version = ++searchVersion
  const query = value.trim()
  searchError.value = ''
  if (!query) {
    results.value = []
    return
  }
  searching.value = true
  try {
    const response = await api.get<{ data: Person[] }>(`/people?search=${encodeURIComponent(query)}`)
    if (version === searchVersion && active) results.value = response.data
  } catch (error) {
    if (version === searchVersion && active) {
      searchError.value = ministriesErrorMessage(error, 'Не удалось найти людей. Попробуйте ещё раз.')
    }
  } finally {
    if (version === searchVersion && active) searching.value = false
  }
})

async function add(person: Person) {
  if (adding.value) return
  adding.value = true
  addError.value = ''
  try {
    const response = await api.post<{ data: Member }>(`/ministries/${encodeURIComponent(props.ministryId)}/members`, { person_id: person.id })
    if (active) emit('added', response.data)
  } catch (error) {
    if (active) addError.value = ministriesErrorMessage(error, 'Не удалось добавить участника. Попробуйте ещё раз.')
  } finally {
    if (active) adding.value = false
  }
}

function close() {
  dialog.value?.close()
  emit('close')
}

onMounted(() => dialog.value?.showModal())
</script>

<template>
  <dialog ref="dialog" aria-labelledby="add-member-title" @cancel.prevent="close">
    <h2 id="add-member-title">Добавить участника</h2>
    <label>
      Поиск по имени и фамилии
      <input v-model="search" type="search" maxlength="200" data-test="member-search" placeholder="Имя или фамилия" :disabled="adding">
    </label>
    <p v-if="searching" role="status">Поиск…</p>
    <p v-else-if="searchError" role="alert">{{ searchError }}</p>
    <ul v-else-if="search.trim()" class="add-member__results">
      <li v-for="person in results" :key="person.id">
        <button type="button" :data-test="`person-option-${person.id}`" :disabled="adding" @click="add(person)">
          {{ person.full_name }}
        </button>
      </li>
      <li v-if="!results.length">Никого не найдено.</li>
    </ul>
    <p v-if="addError" role="alert">{{ addError }}</p>
    <div class="add-member__actions">
      <button type="button" data-test="cancel-add-member" :disabled="adding" @click="close">Отмена</button>
    </div>
  </dialog>
</template>

<style scoped>
dialog { width: min(28rem, calc(100% - 4rem)); border: 1px solid #8b96a6; border-radius: 0.5rem; padding: 1.5rem; }
dialog::backdrop { background: #17213399; }
label { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 1rem; }
input, button { font: inherit; padding: 0.65rem; border: 1px solid #8b96a6; border-radius: 0.3rem; }
.add-member__results { list-style: none; padding: 0; margin: 0; }
.add-member__results button { width: 100%; text-align: left; cursor: pointer; margin-bottom: 0.4rem; }
.add-member__actions { margin-top: 1rem; }
button { cursor: pointer; }
button:disabled { opacity: 0.6; cursor: wait; }
[role='alert'] { color: #a32020; }
</style>
