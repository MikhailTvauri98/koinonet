// Экспортируется для прямого юнит-теста (tests/unit/auth.middleware.spec.ts):
// публичность маршрута — это ровно то, что проверяет эта функция, а не
// побочный эффект прогона всего middleware.
export function isPublicPath(path: string): boolean {
  return path === '/login' || path.startsWith('/invite/') || path.startsWith('/password-reset/')
}

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()

  // Сессия — это cookie на сервере, а не состояние Pinia: после перезагрузки
  // страницы стор пуст, пока мы сами не спросим /auth/me. Спрашиваем один раз
  // за загрузку приложения, а не перед каждым переходом.
  if (!auth.initialized) {
    await auth.fetchMe()
  }

  // Сервер не ответил, кто вошёл: вести на вход нельзя — человек, возможно,
  // вошёл. Экран «Нет связи с сервером» (ConnectionGate.vue) закрывает
  // приложение и повторяет проверку через этот же middleware.
  if (!auth.initialized) return

  const authenticated = auth.user !== null

  if (!authenticated && !isPublicPath(to.path)) {
    return navigateTo('/login')
  }

  if (authenticated && to.path === '/login') {
    return navigateTo('/')
  }
})
