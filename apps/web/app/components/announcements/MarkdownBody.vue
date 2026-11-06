<script setup lang="ts">
import { renderMarkdown } from '~/utils/markdown'
const props = defineProps<{ body: string }>()
const html = computed(() => renderMarkdown(props.body))
</script>

<template>
  <!-- renderMarkdown disables HTML parsing and sanitizes the allowed subset. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown-body" data-test="body" v-html="html" />
</template>

<style scoped>
.markdown-body { min-width: 0; overflow-wrap: anywhere; line-height: 1.65; }
.markdown-body :deep(a) { color: var(--ui-accent); text-decoration: underline; }
.markdown-body :deep(pre) { max-width: 100%; overflow-x: auto; padding: var(--ui-space-3); background: var(--ui-surface-muted); border-radius: var(--ui-radius-sm); }
.markdown-body :deep(blockquote) { margin-inline: 0; padding-left: var(--ui-space-4); border-left: 3px solid var(--ui-border); color: var(--ui-text-muted); }
.markdown-body :deep(ul), .markdown-body :deep(ol) { padding-inline-start: 1.5em; }
</style>
