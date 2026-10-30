<script setup lang="ts">
import { useChatMuted } from '~/composables/useChatMuted'
const props = defineProps<{ until: string | null, disabled?: boolean }>()
defineEmits<{ mute: [hours?: number], unmute: [] }>()
const muted = useChatMuted(() => props.until)
</script>
<template>
  <div aria-label="Звук чата">
    <button v-if="muted" data-test="unmute" type="button" :disabled="disabled" @click="$emit('unmute')">Включить звук</button>
    <template v-else>
      <span>Без звука:</span>
      <button data-test="mute-8h" type="button" :disabled="disabled" @click="$emit('mute', 8)">На 8 часов</button>
      <button data-test="mute-week" type="button" :disabled="disabled" @click="$emit('mute', 168)">На неделю</button>
      <button data-test="mute-forever" type="button" :disabled="disabled" @click="$emit('mute')">Навсегда</button>
    </template>
  </div>
</template>
