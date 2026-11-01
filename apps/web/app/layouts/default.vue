<script setup lang="ts">
const navigationHeight = ref<number>()
</script>

<template>
  <div class="app-layout" :style="navigationHeight === undefined ? undefined : { '--app-nav-height': navigationHeight + 'px' }">
    <a class="app-layout__skip" href="#main-content">К содержимому</a>
    <AppNav @resize="navigationHeight = $event" />
    <main id="main-content" class="app-layout__content" tabindex="-1">
      <div class="app-layout__inner">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  --app-nav-height: calc(var(--ui-mobile-nav-space) + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}

.app-layout__content {
  flex: 1;
  min-width: 0;
  padding: var(--ui-space-4);
  padding-bottom: calc(var(--app-nav-height) + var(--ui-space-4));
}

.app-layout__inner {
  width: 100%;
  max-width: var(--ui-content-width);
  min-width: 0;
  margin-inline: auto;
  padding: min(var(--ui-space-6), 24px);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow);
}

.app-layout__skip {
  position: fixed;
  z-index: 30;
  top: var(--ui-space-3);
  left: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  color: var(--ui-surface);
  background: var(--ui-accent);
  border-radius: var(--ui-radius-sm);
  transform: translateY(calc(-100% - 1rem));
}

.app-layout__skip:focus {
  transform: translateY(0);
}

@media (max-width: 767px) {
  .app-layout__content { padding-inline: min(var(--ui-space-3), 12px); }
  .app-layout__inner { padding: min(var(--ui-space-4), 16px); }
}

@media (min-width: 768px) {
  .app-layout {
    flex-direction: row;
  }

  .app-layout__content {
    padding: clamp(16px, 2.5vw, 40px);
  }
}
</style>
