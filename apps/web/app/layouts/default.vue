<template>
  <div class="app-layout">
    <AppNav />
    <main class="app-layout__content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-layout__content {
  flex: 1;
  padding: 1rem;
  /* Место для нижней панели вкладок на телефоне (AppNav.vue). */
  padding-bottom: 4.5rem;
}

@media (min-width: 768px) {
  .app-layout {
    flex-direction: row;
  }

  .app-layout__content {
    padding-bottom: 1rem;
  }
}
</style>
