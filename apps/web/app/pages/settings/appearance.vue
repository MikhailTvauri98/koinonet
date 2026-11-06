<script setup lang="ts">
import SettingsTabs from '~/components/settings/SettingsTabs.vue'
import FormSection from '~/components/ui/FormSection.vue'
const { theme, setTheme } = useTheme()
</script>

<template>
  <section class="appearance-settings">
    <SettingsTabs />
    <h1>Оформление</h1>
    <FormSection title="Тема оформления">
      <fieldset class="ui-fieldset">
        <legend>Выберите тему</legend>
        <label class="ui-choice"><input type="radio" name="theme" value="dark" :checked="theme === 'dark'" aria-describedby="appearance-device-hint" @change="setTheme('dark')">Тёмная</label>
        <label class="ui-choice"><input type="radio" name="theme" value="light" :checked="theme === 'light'" aria-describedby="appearance-device-hint" @change="setTheme('light')">Светлая</label>
      </fieldset>
      <p id="appearance-device-hint" class="ui-hint">Выбор применяется сразу и сохраняется на этом устройстве. Выход из аккаунта не меняет оформление.</p>
    </FormSection>
  </section>
</template>

<style scoped>
.appearance-settings { max-width: 48rem; min-width: 0; }
</style>
