import { createApp } from 'vue'
import FoundationPrimitives from '../fixtures/FoundationPrimitives.vue'

// Imported through Vite only by Playwright; no application route or production fixture.
export function mount() {
  const main = document.getElementById('main-content')!
  const host = document.createElement('div')
  main.replaceChildren(host)
  createApp(FoundationPrimitives).mount(host)
}
