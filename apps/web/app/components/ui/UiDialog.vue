<script setup lang="ts">
const props = defineProps<{ open: boolean, label: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
let opener: HTMLElement | null = null
function restoreFocus() {
  const target = opener
  opener = null
  if (target?.isConnected && !target.matches(':disabled') && target.getClientRects().length > 0) {
    target.focus()
    if (document.activeElement === target) return
  }
  document.getElementById('main-content')?.focus()
}
function syncOpen() {
  const element = dialog.value
  if (!element) return
  if (props.open && !element.open) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
  } else if (!props.open && element.open) {
    element.close()
    restoreFocus()
  }
}
function trapTab(event: KeyboardEvent) {
  const element = dialog.value
  if (event.key !== 'Tab' || event.defaultPrevented || !props.open || !element?.open) return
  const active = document.activeElement
  if (active === document.body && Array.from(document.querySelectorAll('dialog:modal')).some(other => other !== element)) return
  if (active !== document.body && active !== element && !element.contains(active)) return
  const targets = Array.from(element.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex], [contenteditable="true"], summary'))
    .filter(target => target.tabIndex >= 0 && !target.matches(':disabled') && target.getClientRects().length > 0)
  const first = targets[0], last = targets.at(-1)
  if (!first || !last) { event.preventDefault(); element.focus(); return }
  if (event.shiftKey && (active === first || !targets.includes(active as HTMLElement))) {
    event.preventDefault(); last.focus()
  } else if (!event.shiftKey && (active === last || !targets.includes(active as HTMLElement))) {
    event.preventDefault(); first.focus()
  }
}
watch(() => props.open, syncOpen, { flush: 'post' })
onMounted(() => { syncOpen(); document.addEventListener('keydown', trapTab) })
onBeforeUnmount(() => {
  document.removeEventListener('keydown', trapTab)
  if (dialog.value?.open) dialog.value.close()
  if (opener) restoreFocus()
})
</script>

<template>
  <dialog ref="dialog" :aria-label="label" tabindex="-1" class="ui-dialog" @cancel.prevent="emit('close')" @close="open && emit('close')">
    <div class="ui-dialog__content"><slot /></div>
    <footer v-if="$slots.actions" class="ui-dialog__actions"><slot name="actions" /></footer>
  </dialog>
</template>

<style scoped>
.ui-dialog {
  width: min(36rem, calc(100% - 32px));
  max-width: calc(100% - 32px);
  max-height: calc(100dvh - 32px);
  margin: auto;
  padding: min(var(--ui-space-4), 16px);
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  box-shadow: var(--ui-shadow);
  overflow: auto;
  overflow-wrap: anywhere;
}
.ui-dialog::backdrop { background: #17213399; }
.ui-dialog__content { min-width: 0; }
.ui-dialog__content > :deep(*) { min-width: 0; }
.ui-dialog__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: var(--ui-space-2); margin-top: var(--ui-space-4); padding-top: var(--ui-space-4); border-top: 1px solid var(--ui-border); }
.ui-dialog :deep(h2:first-child) { margin-top: 0; }
.ui-dialog :deep(form:not(.ui-form)) { display: grid; gap: var(--ui-space-3); min-width: 0; }
.ui-dialog :deep(label:has(> input:not([type='checkbox'], [type='radio'], [type='file']))), .ui-dialog :deep(label:has(> textarea)), .ui-dialog :deep(label:has(> select)) { display: grid; gap: var(--ui-space-2); min-width: 0; }
.ui-dialog :deep(input:not([type='checkbox'], [type='radio'], [type='file'], [type='hidden'])), .ui-dialog :deep(textarea), .ui-dialog :deep(select) { width: 100%; max-width: 100%; }
.ui-dialog :deep(button) { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
.ui-dialog :deep(ul) { padding-inline-start: var(--ui-space-4); }
.ui-dialog :deep(li) { min-width: 0; }
</style>
