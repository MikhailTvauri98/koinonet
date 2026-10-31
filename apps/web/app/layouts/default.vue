<template>
  <div class="app-layout">
    <a class="app-layout__skip" href="#main-content">К содержимому</a>
    <AppNav />
    <main id="main-content" class="app-layout__content" tabindex="-1">
      <div class="app-layout__inner">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}

.app-layout__content {
  flex: 1;
  min-width: 0;
  padding: var(--ui-space-4);
  padding-bottom: calc(var(--ui-mobile-nav-space) + env(safe-area-inset-bottom, 0px));
}

.app-layout__inner {
  width: 100%;
  max-width: var(--ui-content-width);
  min-width: 0;
  margin-inline: auto;
  padding: var(--ui-space-6);
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
  .app-layout__content { padding-inline: var(--ui-space-3); }
  .app-layout__inner { padding: var(--ui-space-4); }
}

@media (min-width: 768px) {
  .app-layout {
    flex-direction: row;
  }

  .app-layout__content {
    padding: clamp(1rem, 2.5vw, 2.5rem);
  }
}
</style>
