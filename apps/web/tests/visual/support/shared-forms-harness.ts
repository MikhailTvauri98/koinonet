import { createApp } from 'vue'
import SharedForms from '../fixtures/SharedForms.vue'

// Imported through Vite only by Playwright; no application route or production fixture.
export function mount() {
  const main = document.getElementById('main-content')!
  const host = document.createElement('div')
  main.replaceChildren(host)
  createApp(SharedForms).mount(host)
}
