<script setup lang="ts">
import { ref } from 'vue'
import FormSection from '../../../app/components/ui/FormSection.vue'
import UiDialog from '../../../app/components/ui/UiDialog.vue'
import PasswordField from '../../../app/components/PasswordField.vue'
import LoadingState from '../../../app/components/ui/LoadingState.vue'
import EmptyState from '../../../app/components/ui/EmptyState.vue'
const open = ref(false)
const password = ref('')
const saved = ref(false)
</script>

<template>
  <div data-test="shared-forms" style="max-width: 960px; margin: 0; padding: 16px">
    <h1>Общие формы</h1>
    <button class="ui-button ui-button--primary" @click="open = true">Открыть окно</button>
    <form class="ui-form" @submit.prevent>
      <div class="ui-form-grid" data-test="form-grid">
        <FormSection title="О событии" description="Основные сведения для назначенных людей.">
          <label class="ui-field">Название события<input value="Молитвенный вечер и подготовка к воскресному событию"></label>
          <label class="ui-field">Описание<textarea rows="3" placeholder="Что важно знать назначенным" /></label>
        </FormSection>
        <FormSection title="Видимость и уведомление">
          <label class="ui-field">Кто видит событие<select><option>Вся церковь</option><option>Только назначенные</option></select></label>
          <fieldset class="ui-fieldset"><legend>Уведомление</legend><label class="ui-choice"><input type="radio" name="notify" checked>Уведомить всех о новом событии</label><label class="ui-choice"><input type="radio" name="notify">Без уведомления</label></fieldset>
          <label class="ui-choice"><input type="checkbox">Показать в личном календаре</label>
        </FormSection>
      </div>
    </form>
    <LoadingState label="Загружаем разрешённые варианты…" />
    <EmptyState title="Слотов пока нет" description="Их можно добавить сейчас или позже."><button class="ui-button">Добавить слот</button></EmptyState>
    <UiDialog :open="open" label="Сохранение изменений" @close="open = false">
      <header class="ui-dialog-header"><h2>Сохранение изменений</h2><button type="button" aria-label="Закрыть окно" @click="open = false">×</button></header>
      <form id="shared-form" class="ui-form" @submit.prevent="saved = true">
        <p>Подтвердите изменение пароля для этого аккаунта.</p>
        <PasswordField v-model="password" label="Новый пароль" error="Введите не менее 8 символов." aria-describedby="password-note" autofocus />
        <p id="password-note" class="ui-hint">Используйте буквы и цифры.</p>
      </form>
      <p v-if="saved" role="status">Изменения сохранены</p>
      <template #actions>
        <button type="button" class="ui-button ui-button--danger" @click="open = false">Отменить изменения</button>
        <button type="button" class="ui-button" @click="open = false">Назад</button>
        <button type="submit" form="shared-form" class="ui-button ui-button--primary">Сохранить</button>
      </template>
    </UiDialog>
  </div>
</template>
