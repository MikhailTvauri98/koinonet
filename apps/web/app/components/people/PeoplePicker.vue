<script setup lang="ts">
import type { Person } from '~/utils/people'
import { usePeoplePicker } from '~/composables/usePeoplePicker'
const props = withDefaults(defineProps<{ mode: 'people' | 'accounts', excludedIds?: string[], disabled?: boolean }>(), { excludedIds: () => [] })
const emit = defineEmits<{ select: [person: Person] }>()
const { search, people, candidates, loading, error, page, available, hasMore, more, retry } = usePeoplePicker({
  mode: () => props.mode, excludedIds: () => props.excludedIds, disabled: () => props.disabled,
})
// The account adapter translates its user IDs using these actual directory records.
defineExpose({ people: readonly(people) })
function select(person: Person) {
  if (available.value && !props.disabled && candidates.value.some(candidate => candidate.id === person.id)) emit('select', person)
}
function initials(person: Person) { return person.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('') }
</script>

<template>
  <div class="people-picker">
    <p v-if="!available" role="status">Нет права на просмотр справочника. Выбор участников недоступен. Откройте окно снова после смены аккаунта.</p>
    <template v-else>
      <label class="people-picker__search">
        Найти человека
        <input v-model="search" data-test="search" class="ui-input" type="search" maxlength="200" placeholder="Имя или фамилия" :disabled="disabled">
      </label>
      <p v-if="loading" role="status">Загрузка…</p>
      <p v-if="error" role="alert">{{ error }} <button type="button" class="ui-button ui-button--secondary" :disabled="loading || disabled" @click="retry">Повторить</button></p>
      <ul class="people-picker__list" aria-label="Доступные люди" :aria-busy="loading">
        <li v-for="person in candidates" :key="person.id">
          <button type="button" class="people-picker__option" :data-test="`option-${person.id}`" :disabled="disabled" @click="select(person)">
            <img v-if="person.photo_url" class="people-picker__avatar" :src="person.photo_url" alt="">
            <span v-else class="people-picker__avatar" aria-hidden="true">{{ initials(person) }}</span>
            <span class="people-picker__name">{{ person.full_name }}</span>
            <span class="people-picker__choose" aria-hidden="true">＋</span>
          </button>
        </li>
      </ul>
      <p v-if="!loading && !error && page && !candidates.length" role="status">{{ hasMore ? 'На загруженных страницах нет доступных вариантов. Загрузите следующую.' : 'Доступных людей не найдено.' }}</p>
      <button v-if="hasMore" type="button" data-test="more-people" class="ui-button ui-button--secondary" :disabled="loading || disabled" @click="more">Показать ещё</button>
    </template>
  </div>
</template>

<style scoped>
.people-picker { display: grid; gap: 12px; min-width: 0; }
.people-picker__search { display: grid; gap: 8px; min-width: 0; }
.people-picker__list { list-style: none; padding: 0 !important; margin: 0; max-height: min(24rem, 45dvh); overflow-y: auto; min-width: 0; }
.people-picker__list li + li { border-top: 1px solid var(--ui-border); }
.people-picker__option { display: flex; gap: 12px; align-items: center; width: 100%; min-height: 64px; padding: 12px 4px; border: 0; border-radius: 8px; background: transparent; text-align: left; }
.people-picker__avatar { display: grid; place-items: center; flex: 0 0 44px; width: 44px; height: 44px; border-radius: 50%; object-fit: cover; background: var(--ui-accent-soft); color: var(--ui-accent); font-size: .875rem; }
.people-picker__name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.people-picker__choose { flex: 0 0 auto; color: var(--ui-accent); }
.people-picker p { margin: 0; }
@media (max-width: 359px) { .people-picker__option { flex-wrap: wrap; } .people-picker__name { flex-basis: 100%; order: 2; } .people-picker__choose { margin-left: auto; } }
@media (max-width: 479px) and (max-height: 600px) {
  .people-picker__list { max-height: none; overflow: visible; }
}
</style>
