<script setup lang="ts">
import { useChatMuted } from '~/composables/useChatMuted'
const props = defineProps<{ until: string | null, disabled?: boolean }>()
defineEmits<{ mute: [hours?: number], unmute: [] }>()
const muted = useChatMuted(() => props.until)
const { formatDateTime } = useChurchDate()
const state = computed(() => !muted.value ? 'sound' : Date.parse(props.until ?? '') >= Date.parse('9999-01-01T00:00:00Z') ? 'forever' : 'until')
const status = computed(() => state.value === 'sound' ? 'Звук включён' : state.value === 'forever' ? 'Без звука бессрочно' : `Без звука до ${formatDateTime(props.until!)}`)
const statusId = useId()
</script>
<template>
  <section class="mute-menu" aria-label="Звук чата">
    <h3>Звук чата</h3>
    <p :id="statusId" class="mute-menu__status" role="status">{{ status }}</p>
    <div class="mute-menu__options">
      <button data-test="unmute" type="button" :aria-pressed="state === 'sound'" :disabled="disabled" @click="$emit('unmute')"><span>{{ muted ? 'Включить звук' : 'Со звуком' }}</span><span v-if="state === 'sound'" aria-hidden="true">✓</span></button>
      <p class="mute-menu__label">Без звука</p>
      <button data-test="mute-8h" type="button" :aria-describedby="statusId" :disabled="disabled" @click="$emit('mute', 8)"><span>На 8 часов</span></button>
      <button data-test="mute-week" type="button" :aria-describedby="statusId" :disabled="disabled" @click="$emit('mute', 168)"><span>На неделю</span></button>
      <button data-test="mute-forever" type="button" :aria-pressed="state === 'forever'" :disabled="disabled" @click="$emit('mute')"><span>Навсегда</span><span v-if="state === 'forever'" aria-hidden="true">✓</span></button>
    </div>
  </section>
</template>
<style scoped>
.mute-menu { padding-top: min(1rem, 16px); border-top: 1px solid var(--ui-border); }
h3 { margin: 0 0 .25rem; font-size: 1rem; }
.mute-menu__status { color: var(--ui-text-muted); font-size: .875rem; margin: 0 0 .75rem; }
.mute-menu__label { margin: .25rem 0 0; color: var(--ui-text-muted); font-size: .875rem; }
.mute-menu__options { display: grid; gap: min(.5rem, 8px); }
button { display: flex; justify-content: space-between; gap: min(.75rem, 12px); align-items: center; min-height: 44px; width: 100%; text-align: left; }
button[aria-pressed='true'] { background: var(--ui-accent-soft); border-color: var(--ui-accent); color: var(--ui-accent); }
</style>
