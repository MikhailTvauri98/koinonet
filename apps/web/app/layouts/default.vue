<script setup lang="ts">
const navigationHeight = ref<number>()
const route = useRoute()
const chatLayout = computed(() => route.meta.chatLayout === true)
</script>

<template>
  <div class="app-layout" :class="{ 'app-layout--chat': chatLayout }" :style="navigationHeight === undefined ? undefined : { '--app-nav-height': navigationHeight + 'px' }">
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
/* Chat routes distribute available block size through every ancestor.
   Navigation supplies its measured border-box height, including safe areas. */
.app-layout--chat { height: 100dvh; min-height: 0; }
.app-layout--chat .app-layout__content { display: flex; min-height: 0; padding: 8px; padding-bottom: calc(var(--app-nav-height) + 8px); }
.app-layout--chat .app-layout__inner { display: flex; flex-direction: column; min-height: 0; padding: 8px; overflow-y: auto; }
@media (min-width: 768px) {
  .app-layout--chat .app-layout__content { padding: min(var(--ui-space-4), 16px); }
  .app-layout--chat .app-layout__inner { padding: min(var(--ui-space-4), 16px); }
}
@media (min-width: 768px) and (max-height: 500px) {
  .app-layout--chat .app-layout__content, .app-layout--chat .app-layout__inner { padding: 8px; }
}
</style>
