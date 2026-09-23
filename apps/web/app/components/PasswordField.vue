<script setup lang="ts">
// Подписанные атрибуты (data-test, id и т.п.) уходят на сам <input>, а не на
// обёртку <label> — иначе тесты, ищущие поле по data-test, находили бы label
// и не смогли бы вызвать setValue на элементе формы.
defineOptions({ inheritAttrs: false })

defineProps<{ label: string }>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <label class="password-field">
    {{ label }}
    <input
      v-model="model"
      v-bind="$attrs"
      type="password"
      autocomplete="new-password"
      minlength="8"
      required
    >
  </label>
</template>
