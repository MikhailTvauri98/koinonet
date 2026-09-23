function isPublicPath(path: string): boolean {
  return path === '/login' || path.startsWith('/invite/')
}

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()

  // Сессия — это cookie на сервере, а не состояние Pinia: после перезагрузки
  // страницы стор пуст, пока мы сами не спросим /auth/me. Спрашиваем один раз
  // за загрузку приложения, а не перед каждым переходом.
  if (!auth.initialized) {
    await auth.fetchMe()
  }

  const authenticated = auth.user !== null

  if (!authenticated && !isPublicPath(to.path)) {
    return navigateTo('/login')
  }

  if (authenticated && to.path === '/login') {
    return navigateTo('/')
  }
})
