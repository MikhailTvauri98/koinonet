<script setup lang="ts">
import type { components } from '~~/types/api'
const props = defineProps<{ chat: components['schemas']['ChatResource'], member: boolean, busy: boolean }>()
defineEmits<{ mute: [] }>()
const muted = computed(() => !!props.chat.muted_until && new Date(props.chat.muted_until).getTime() > Date.now())
</script>
<template>
  <header class="chat-header">
    <img v-if="chat.avatar_url" :src="chat.avatar_url" alt="" width="44" height="44">
    <div><h1>{{ chat.title }}</h1><details><summary>Участники: {{ chat.members.length }}</summary><ul><li v-for="person in chat.members" :key="person.user_id">{{ person.full_name || 'Участник' }}</li></ul></details></div>
    <button v-if="member" type="button" :disabled="busy" :aria-pressed="muted" @click="$emit('mute')">{{ muted ? 'Включить звук' : 'Без звука' }}</button>
    <slot name="menu" />
  </header>
</template>
<style scoped>
.chat-header { display: flex; align-items: center; gap: .8rem; padding: .7rem 0; border-bottom: 1px solid #d5dde4; }
h1 { font-size: 1.25rem; margin: 0 0 .2rem; overflow-wrap: anywhere; }
.chat-header > button { margin-left: auto; }
.chat-header img { border-radius: 50%; object-fit: cover; }
</style>
