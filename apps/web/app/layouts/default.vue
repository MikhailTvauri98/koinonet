<script setup lang="ts">
const navigationHeight = ref<number>()
const navigationInFlow = ref(false)
const route = useRoute()
const chatLayout = computed(() => route.meta.chatLayout === true)
</script>

<template>
  <div class="app-layout" :class="{ 'app-layout--chat': chatLayout, 'app-layout--nav-flow': navigationInFlow }" :style="navigationHeight === undefined ? undefined : { '--app-nav-height': navigationHeight + 'px' }">
    <a class="app-layout__skip" href="#main-content">К содержимому</a>
    <AppNav @resize="navigationHeight = $event" @flow="navigationInFlow = $event" />
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
  padding: 24px 16px;
  padding-bottom: calc(var(--app-nav-height) + 24px);
}

.app-layout__inner {
  width: 100%;
  max-width: min(var(--ui-content-width), 1152px);
  min-width: 0;
  margin-inline: 0;
}

/* Page roots may constrain reading width, but share the shell's left edge. */
.app-layout .app-layout__inner > :deep(:is(main, section, div)) { margin-inline: 0; }

.app-layout__skip {
  position: fixed;
  z-index: 30;
  top: var(--ui-space-3);
  left: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  color: var(--ui-on-accent);
  background: var(--ui-accent);
  border-radius: var(--ui-radius-sm);
  transform: translateY(calc(-100% - 1rem));
}

.app-layout__skip:focus {
  transform: translateY(0);
}

@media (min-width: 768px) {
  .app-layout {
    flex-direction: row;
  }

  .app-layout__content {
    padding: 32px clamp(24px, 2.2vw, 32px);
  }
}
/* Chat routes distribute available block size through every ancestor.
   Navigation supplies its measured border-box height, including safe areas. */
.app-layout--chat { height: 100dvh; min-height: 0; }
.app-layout--chat .app-layout__content { display: flex; min-height: 0; padding: 8px; padding-bottom: calc(var(--app-nav-height) + 8px); }
.app-layout--chat .app-layout__inner { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; }
/* A tall mobile bar joins document flow; chat content needs its own useful
   viewport-sized surface rather than competing with it inside a fixed shell. */
.app-layout--chat.app-layout--nav-flow { height: auto; min-height: 100dvh; }
.app-layout--chat.app-layout--nav-flow .app-layout__content { flex: none; min-height: 100dvh; }
.app-layout--chat.app-layout--nav-flow .app-layout__inner { overflow-y: visible; }
@media (min-width: 768px) {
  .app-layout--chat .app-layout__content { padding: 16px; }
}
@media (min-width: 768px) and (max-height: 500px) {
  .app-layout--chat .app-layout__content { padding: 8px; }
}
</style>
