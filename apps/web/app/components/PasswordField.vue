<script setup lang="ts">
import type { AriaAttributes } from 'vue'
// Подписанные атрибуты (data-test, id и т.п.) уходят на сам <input>, а не на
// обёртку <label> — иначе тесты, ищущие поле по data-test, находили бы label
// и не смогли бы вызвать setValue на элементе формы.
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  label: string
  autocomplete?: 'new-password' | 'current-password'
  error?: string
}>(), { autocomplete: 'new-password', error: '' })

const model = defineModel<string>({ required: true })
const errorId = useId()
const labelId = useId()
</script>

<template>
  <label class="password-field account-field">
    <span :id="labelId">{{ label }}</span>
    <input
      v-model="model"
      v-bind="$attrs"
      :aria-labelledby="($attrs['aria-labelledby'] as string | undefined) || ($attrs['aria-label'] ? undefined : labelId)"
      :aria-invalid="error ? 'true' : ($attrs['aria-invalid'] as AriaAttributes['aria-invalid'])"
      :aria-describedby="[$attrs['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') || undefined"
      type="password"
      :autocomplete="autocomplete"
      :minlength="autocomplete === 'new-password' ? 8 : undefined"
      required
    >
    <span v-if="error" :id="errorId" class="ui-field-error" role="alert">{{ error }}</span>
  </label>
</template>
