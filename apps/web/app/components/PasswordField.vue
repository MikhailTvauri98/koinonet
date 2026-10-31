<script setup lang="ts">
// Подписанные атрибуты (data-test, id и т.п.) уходят на сам <input>, а не на
// обёртку <label> — иначе тесты, ищущие поле по data-test, находили бы label
// и не смогли бы вызвать setValue на элементе формы.
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  label: string
  autocomplete?: 'new-password' | 'current-password'
}>(), { autocomplete: 'new-password' })

const model = defineModel<string>({ required: true })
</script>

<template>
  <label class="password-field account-field">
    <span>{{ label }}</span>
    <input
      v-model="model"
      v-bind="$attrs"
      type="password"
      :autocomplete="autocomplete"
      :minlength="autocomplete === 'new-password' ? 8 : undefined"
      required
    >
  </label>
</template>
