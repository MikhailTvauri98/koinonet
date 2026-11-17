<script setup lang="ts">
import { computed, ref } from 'vue'
import { colorKeyForId } from '~/utils/ministryColor'

const props = withDefaults(defineProps<{ id: string, name: string | null, photoUrl?: string | null, size?: 'sm' | 'md' | 'lg', decorative?: boolean }>(), { photoUrl: null, size: 'md', decorative: false })
// Неудачный адрес фото запоминается: новый адрес от API снова показывает фото.
const failedUrl = ref<string | null>(null)

const words = computed(() => props.name?.trim().split(/\s+/).filter(Boolean) ?? [])
const label = computed(() => words.value.length ? words.value.join(' ') : 'Участник')
const initials = computed(() => words.value.length ? words.value.slice(0, 2).map(word => Array.from(word)[0]!.toLocaleUpperCase('ru-RU')).join('') : '?')
// Скрытое имя — нейтральный цвет церкви: оттенок не должен выделять неизвестного человека.
const tint = computed(() => words.value.length ? `var(--ui-ministry-${colorKeyForId(props.id)})` : 'var(--ui-ministry-church)')
const photo = computed(() => props.photoUrl && props.photoUrl !== failedUrl.value ? props.photoUrl : null)
</script>

<template>
  <span class="ui-avatar ui-tinted" :class="`ui-avatar--${size}`" :role="decorative ? undefined : 'img'" :aria-label="decorative ? undefined : label" :aria-hidden="decorative ? 'true' : undefined" :style="{ '--tint-color': tint }">
    <img v-if="photo" :src="photo" alt="" loading="lazy" @error="failedUrl = photo">
    <span v-else aria-hidden="true">{{ initials }}</span>
  </span>
</template>

<style scoped>
/* Размер круга фиксирован: имя рядом с аватаром растёт с текстом, инициалы лишь подсказка. */
.ui-avatar { display: inline-grid; place-items: center; flex: none; overflow: hidden; border-radius: 50%; font-weight: 700; line-height: 1; letter-spacing: .02em; user-select: none; }
.ui-avatar--sm { width: 32px; height: 32px; font-size: min(.875rem, 14px); }
.ui-avatar--md { width: 44px; height: 44px; font-size: min(1rem, 16px); }
.ui-avatar--lg { width: 64px; height: 64px; font-size: min(1.375rem, 22px); }
.ui-avatar img { width: 100%; height: 100%; object-fit: cover; }
</style>
