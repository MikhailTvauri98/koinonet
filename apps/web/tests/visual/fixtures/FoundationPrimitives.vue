<script setup lang="ts">
import MinistryMark from '../../../app/components/ui/MinistryMark.vue'
import UiAvatar from '../../../app/components/ui/UiAvatar.vue'
import { MINISTRY_COLORS } from '../../../app/utils/ministryColor'

const ministries = [...MINISTRY_COLORS.map(({ key, label }) => ({ id: `m-${key}`, name: `${label} цвет`, color: key })), null]
const names = ['Мария Кузнецова', 'Дмитрий Смирнов', 'Екатерина Васильева', 'Ольга Иванова', 'Алексей Петров', 'Ирина Новикова', 'Роман Белов', 'Павел Соколов', 'Вера Смирнова', 'Анна Орлова', 'Глеб Морозов', 'Нина Лебедева']
const people = names.map((name, index) => ({ id: `01JCPERSON${String(index).padStart(16, '0')}`, name }))
</script>

<template>
  <div data-test="foundation" style="max-width: 960px; margin: 0; padding: 16px">
    <h1>Основа интерфейса</h1>
    <section aria-label="Кнопки" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center">
      <button type="button" data-level="base">Без класса</button>
      <button type="button" class="ui-button" data-level="default">Изменить</button>
      <button type="button" class="ui-button ui-button--primary" data-level="primary">Создать событие</button>
      <button type="button" class="ui-button ui-button--quiet" data-level="quiet">Все события</button>
      <button type="button" class="ui-button ui-button--danger" data-level="danger">Подтвердить удаление</button>
      <a href="#foundation-link" class="ui-button" data-level="link">Ссылка как кнопка</a>
      <label class="ui-field">Поле<input type="text" value="Текст"></label>
    </section>
    <div class="ui-surface-muted" data-test="muted-surface" role="group" aria-label="Подтверждение" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 16px; padding: 16px; border-radius: 10px; background: var(--ui-surface-muted)">
      <button type="button" data-muted="base">Без класса</button>
      <button type="button" class="ui-button" data-muted="default">Отмена</button>
      <button type="button" class="ui-button ui-button--danger" data-muted="danger">Подтвердить архивацию</button>
      <a href="#foundation-muted-link" class="ui-button" data-muted="link">Ссылка</a>
      <button type="button" class="ui-button ui-button--quiet" data-muted="quiet">Показать ещё</button>
      <dialog data-test="nested-dialog"><button type="button" class="ui-button" data-muted="dialog">Закрыть</button></dialog>
    </div>
    <div class="ui-surface-accent" data-test="accent-surface" role="group" aria-label="Выбранные участники" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 16px; padding: 16px; border-radius: 10px">
      <button type="button" data-muted="base">Открепить</button>
      <button type="button" class="ui-button" data-muted="default">Убрать</button>
      <button type="button" class="ui-button ui-button--danger" data-muted="danger">Удалить</button>
      <a href="#foundation-accent-link" class="ui-button" data-muted="link">Ссылка</a>
      <button type="button" class="ui-button ui-button--quiet" data-muted="quiet">Показать ещё</button>
      <dialog><button type="button" class="ui-button" data-muted="dialog">Закрыть</button></dialog>
    </div>
    <section aria-label="Метки служений" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px">
      <MinistryMark v-for="ministry in ministries" :key="ministry?.id ?? 'church'" :ministry="ministry" />
    </section>
    <section aria-label="Точки служений" style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px">
      <MinistryMark v-for="ministry in ministries" :key="ministry?.id ?? 'church'" :ministry="ministry" variant="dot" />
    </section>
    <section aria-label="Люди" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 16px">
      <UiAvatar v-for="person in people" :id="person.id" :key="person.id" :name="person.name" />
      <UiAvatar id="01JCPERSONHIDDEN0000000000" :name="null" />
      <UiAvatar id="01JCPERSON0000000000000000" name="Мария Кузнецова" size="sm" />
      <UiAvatar id="01JCPERSON0000000000000000" name="Мария Кузнецова" size="lg" />
    </section>
  </div>
</template>
