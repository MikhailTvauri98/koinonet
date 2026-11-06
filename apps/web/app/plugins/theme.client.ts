export default defineNuxtPlugin(() => {
  const { theme } = useTheme()
  // Reactive head ownership prevents Nuxt from restoring the dark fallback
  // over a saved light choice when it reconciles the server document.
  useHead(() => ({
    htmlAttrs: { 'data-theme': theme.value },
    meta: [{ name: 'theme-color', content: theme.value === 'light' ? '#f5f6f9' : '#141719', tagPriority: -9 }],
  }))
})
