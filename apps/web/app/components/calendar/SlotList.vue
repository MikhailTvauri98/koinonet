<script setup lang="ts">
import type { EventSlot } from '~/composables/useEvents'
import UiAvatar from '~/components/ui/UiAvatar.vue'
const props = defineProps<{ slots: EventSlot[], canManage?: boolean, disabled?: boolean }>()
const emit = defineEmits<{ open: [slot: EventSlot], assign: [slot: EventSlot], manage: [mode: 'new'] }>()
const auth = useAuthStore()
// Строка нажимается только тем, у кого есть что делать в окне слота.
const actionable = (slot: EventSlot) => slot.can_fill || !!props.canManage
const hasFreePlace = (slot: EventSlot) => slot.filled_count < slot.required_count
</script>

<template>
  <section aria-label="Слоты события" class="slot-list">
    <div class="slot-list__heading"><h2>Кто служит</h2><button v-if="canManage" type="button" class="ui-button" data-test="new-slot" :disabled="disabled" @click="emit('manage', 'new')">Добавить слот</button></div>
    <p v-if="!slots.length" class="ui-hint">Слотов пока нет.</p>
    <ul v-else class="slots">
      <li v-for="slot in slots" :key="slot.id" class="slot">
        <component :is="actionable(slot) ? 'button' : 'div'" class="slot__main" :class="{ 'slot__main--button': actionable(slot) }" v-bind="actionable(slot) ? { type: 'button', 'aria-haspopup': 'dialog', disabled, 'data-test': `slot-row-${slot.id}` } : {}" @click="actionable(slot) && emit('open', slot)">
          <span class="slot__heading"><span class="slot__title">{{ slot.label }}</span><span :data-test="`slot-${slot.id}-count`" class="slot__count" :class="{ overfilled: slot.filled_count > slot.required_count }">{{ slot.filled_count }} из {{ slot.required_count }}</span><span v-if="slot.filled_count > slot.required_count" class="slot__over">Сверх нормы: {{ slot.filled_count - slot.required_count }}</span></span>
          <span v-if="slot.assignments.length" class="slot__people"><span v-for="assignment in slot.assignments" :key="assignment.id" class="slot__person"><UiAvatar :id="assignment.person.id" :name="assignment.person.short_name" :photo-url="assignment.person.short_name ? assignment.person.photo_thumb_url : null" size="sm" decorative /><span>{{ assignment.person.short_name ?? 'Имя скрыто' }}<strong v-if="assignment.person.id === auth.person?.id" class="slot__mine"> · вы</strong></span></span></span>
          <span v-else-if="!slot.filled_count" class="slot__empty">Никто не назначен</span>
        </component>
        <button v-if="slot.can_fill && hasFreePlace(slot)" type="button" class="ui-button ui-button--quiet slot__assign" :data-test="`assign-${slot.id}`" :disabled="disabled" @click="emit('assign', slot)">+ Назначить</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.slot-list { min-width: 0; }
.slot-list__heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-space-3); }
h2 { margin: 0; font-size: 1.25rem; }
.slots { list-style: none; padding: 0; margin: var(--ui-space-4) 0 0; }
.slot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-2) var(--ui-space-3); border-top: 1px solid var(--ui-border); min-width: 0; overflow-wrap: anywhere; }
.slot__main { flex: 1 1 14rem; min-width: 0; min-height: 44px; display: grid; gap: var(--ui-space-2); padding-block: var(--ui-space-3); text-align: start; color: var(--ui-text); font: inherit; }
.slot__main--button { background: transparent; border: 0; border-radius: var(--ui-radius-sm); padding-inline: var(--ui-space-2); margin-inline: calc(var(--ui-space-2) * -1); cursor: pointer; }
.slot__main--button:hover { background: var(--ui-surface-muted); }
.slot__heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--ui-space-2) var(--ui-space-3); }
.slot__title { font-weight: 600; }
.slot__count { background: var(--ui-accent-soft); color: var(--ui-accent); border-radius: var(--ui-radius-sm); padding: 2px 8px; font-size: .875rem; font-variant-numeric: tabular-nums; }
.slot__count.overfilled { color: var(--ui-danger); background: var(--ui-surface-muted); }
.slot__over { color: var(--ui-danger); font-size: .875rem; }
.slot__people { display: flex; flex-wrap: wrap; gap: var(--ui-space-2) var(--ui-space-4); }
.slot__person { display: inline-flex; align-items: center; gap: var(--ui-space-2); min-width: 0; }
.slot__mine { color: var(--ui-accent); font-weight: 500; }
.slot__empty { color: var(--ui-text-muted); font-size: .875rem; }
.slot__assign { max-width: 100%; }
</style>
