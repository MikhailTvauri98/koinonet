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
.markdown-body { overflow-wrap: anywhere; }
.markdown-body :deep(a) { color: #234e79; }
</style>
