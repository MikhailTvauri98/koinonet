<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <main class="auth-shell">
    <div class="auth-shell__card">
      <header class="auth-shell__header">
        <span class="auth-shell__mark" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v5m-2-3h4M5 21V11l7-4 7 4v10H5Zm5 0v-6h4v6" />
          </svg>
        </span>
        <h1>{{ title }}</h1>
        <p v-if="description" class="auth-shell__description">{{ description }}</p>
      </header>
      <slot />
    </div>
  </main>
</template>

<style scoped>
.auth-shell {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  /* При увеличении текста боковые отступы не сужают колонку ещё сильнее. */
  padding: clamp(1.5rem, 8vh, 5rem) 16px;
  padding-top: max(clamp(1.5rem, 8vh, 5rem), env(safe-area-inset-top, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-bottom: max(var(--ui-space-6), env(safe-area-inset-bottom, 0px));
}

.auth-shell__card {
  width: 100%;
  max-width: 28rem;
  min-width: 0;
  padding: clamp(20px, 4vw, 32px);
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow);
  overflow-wrap: anywhere;
}

.auth-shell__header { margin-bottom: var(--ui-space-6); }
.auth-shell__header h1 { margin: var(--ui-space-4) 0 var(--ui-space-2); }
.auth-shell__description { margin: 0; color: var(--ui-text-muted); }
.auth-shell__mark {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
}
@media (max-width: 767px) {
  .auth-shell { padding-left: max(8px, env(safe-area-inset-left, 0px)); padding-right: max(8px, env(safe-area-inset-right, 0px)); }
  .auth-shell__card { padding-inline: 12px; }
}
</style>
