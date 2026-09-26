import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

// Конфиг перегенерации иконок PWA (задача 31): `npm run generate-pwa-icons`.
// Источник — public/icons/source.svg (нейтральное изображение, у церкви пока
// нет фирменного знака, см. комментарий в самом source.svg). Пресет
// minimal2023 даёт ровно то, что нужно манифесту и iOS: прозрачные 64/192/512,
// maskable 512 (с безопасной зоной — паддинг 30% по умолчанию пресета) и
// apple-touch-icon 180, плюс favicon.ico. Результат пишется туда же, где
// лежит source.svg — в public/icons/.
export default defineConfig({
  preset,
  images: ['public/icons/source.svg'],
})
