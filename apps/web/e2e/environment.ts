import { fileURLToPath } from 'node:url'

// Окружение сквозных тестов описано только здесь: адреса, отдельная база,
// учётные данные теста и то, чем отличаются два способа поднять API.
//
// API сквозных тестов живёт отдельно от dev-окружения целиком:
// - своя база `church_e2e` в том же Postgres (dev-база `church` не читается
//   и не пишется; подготовка каждый раз приводит `church_e2e` в исходное
//   состояние через migrate:fresh, создавая её при отсутствии);
// - свои номера баз Redis для очереди и кеша: иначе dev-воркер (Horizon на
//   базе 0) забирал бы задания сквозных тестов и выполнял их по `church`, а
//   ключ `settings` в общем кеше (ChurchSettings, rememberForever) смешал бы
//   настройки двух церквей;
// - журнал в stderr процесса, а не в общий storage/logs/laravel.log.
//
// Способ запуска API выбирается явно переменной E2E_API_RUNTIME, без
// угадывания по косвенным признакам:
// - `docker` (по умолчанию, локальная разработка): PHP только в Docker —
//   одноразовые контейнеры сервиса `app` из infra/compose.yml с
//   переопределёнными переменными; у сервера опубликован порт на 127.0.0.1;
// - `native` (задание e2e в CI): PHP с расширениями на самой машине, Postgres
//   и Redis — сервисы задания; подключение к ним приходит из переменных
//   окружения задания (DB_HOST, REDIS_HOST и т.д.).

export type ApiRuntimeName = 'docker' | 'native'

function selectedRuntime(): ApiRuntimeName {
  const value = process.env.E2E_API_RUNTIME ?? 'docker'
  if (value === 'docker' || value === 'native') return value
  throw new Error(`E2E_API_RUNTIME должен быть "docker" или "native", получено "${value}".`)
}

const apiPort = 8010
const webPort = 3010
const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export const e2e = {
  runtime: selectedRuntime(),
  database: 'church_e2e',
  // В dev очередь в базе Redis 0, кеш в базе 1 (config/database.php).
  redisDatabase: '14',
  redisCacheDatabase: '15',
  apiPort,
  webPort,
  apiOrigin: `http://127.0.0.1:${apiPort}`,
  // Клиент открывается с этого источника; сервер предпросмотра Nuxt
  // проксирует /api и /sanctum на apiOrigin (routeRules в nuxt.config.ts).
  webOrigin: `http://127.0.0.1:${webPort}`,
  webDir: fromHere('../'),
  apiDir: fromHere('../../api/'),
  composeFile: fromHere('../../../infra/compose.yml'),
  // Журналы процессов API лежат рядом с трассировками падений и попадают в
  // тот же артефакт CI.
  logDir: fromHere('../test-results/server/'),
} as const

// Переменные каждого процесса API сквозных тестов, одинаковые для обоих
// способов запуска. Реальные переменные окружения сильнее apps/api/.env, а
// сервер запускается с `--no-reload`, иначе `artisan serve` не передал бы их
// дочернему процессу встроенного сервера и тот читал бы только .env.
export const apiEnvironment: Readonly<Record<string, string>> = {
  DB_DATABASE: e2e.database,
  REDIS_DB: e2e.redisDatabase,
  REDIS_CACHE_DB: e2e.redisCacheDatabase,
  APP_URL: e2e.apiOrigin,
  // Ссылки приглашений строятся от FRONTEND_URL и должны вести в предпросмотр.
  FRONTEND_URL: e2e.webOrigin,
  // Браузер шлёт Referer предпросмотра, прокси передаёт его API как есть.
  SANCTUM_STATEFUL_DOMAINS: `127.0.0.1:${webPort}`,
  LOG_CHANNEL: 'stderr',
  // Язык ответов — как в production (.env.example), независимо от локального
  // apps/api/.env: клиент показывает текст сервера у 422, и сценарии видят
  // ровно то, что увидит человек.
  APP_LOCALE: 'ru',
}

// Установка: `app:install` с фиксированными опциями.
export const church = {
  name: 'Церковь сквозных тестов',
  timezone: 'Europe/Moscow',
  phoneRegion: 'RU',
} as const

// Учётные данные теста — только здесь. База одноразовая и существует лишь
// для сквозных тестов.
export const credentials = {
  admin: {
    lastName: 'Орлов',
    firstName: 'Олег',
    login: 'admin@e2e.test',
    password: 'e2e-admin-password',
  },
  // Пароль, который приглашённые в сценариях задают себе сами.
  invitedPassword: 'e2e-invited-password',
} as const

export interface SpawnSpec {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  // Контейнер, в котором выполняется команда (способ docker). Завершение
  // клиента `docker compose run` контейнер не останавливает, поэтому при
  // остановке и при превышении предела его убирают по этому имени.
  container?: string
}

export interface ApiRuntime {
  name: ApiRuntimeName
  // Разовая команда artisan, завершающаяся сама.
  artisan(args: string[]): SpawnSpec
  // Долгоживущий процесс: HTTP-сервер API или воркер очереди.
  longRunning(role: LongRunningRole): SpawnSpec
  // Печатает идентификаторы всех контейнеров сквозных тестов, по одному в
  // строке; null — у способа запуска контейнеров нет.
  listContainers(): SpawnSpec | null
  removeContainers(ids: string[]): SpawnSpec
}

export type LongRunningRole = 'api' | 'worker'

// Метка всех контейнеров сквозных тестов — и разовых, и долгоживущих.
// Ключ привязан к этому репозиторию: очистка по нему не заденет контейнеры
// других проектов на той же машине (имя compose-проекта `infra` для этого
// не годится — оно общее у всех, чей compose-файл лежит в каталоге infra).
export const containerLabel = { key: 'curchcowork.e2e', value: 'true' } as const

const containerNames: Record<LongRunningRole, string> = {
  api: 'church-e2e-api',
  worker: 'church-e2e-worker',
}

function dockerRuntime(): ApiRuntime {
  const environmentFlags = Object.entries(apiEnvironment).flatMap(([key, value]) => ['-e', `${key}=${value}`])
  const label = `${containerLabel.key}=${containerLabel.value}`
  const compose = (name: string) => ['compose', '-f', e2e.composeFile, 'run', '--rm', '-T', '--label', label, '--name', name]
  const spec = (args: string[], container?: string): SpawnSpec => ({ command: 'docker', args, cwd: e2e.webDir, env: process.env, container })
  let oneOffCount = 0

  return {
    name: 'docker',
    artisan: (args) => {
      const name = `church-e2e-once-${process.pid}-${++oneOffCount}`
      return spec([...compose(name), ...environmentFlags, 'app', 'php', 'artisan', ...args], name)
    },
    longRunning: (role) => {
      const name = containerNames[role]
      return role === 'api'
        // Внутри контейнера сервер слушает все интерфейсы своего сетевого
        // пространства, наружу порт опубликован только на 127.0.0.1 хоста.
        ? spec([...compose(name), '-p', `127.0.0.1:${e2e.apiPort}:8000`, ...environmentFlags,
            'app', 'php', 'artisan', 'serve', '--no-reload', '--host=0.0.0.0', '--port=8000'], name)
        : spec([...compose(name), ...environmentFlags, 'app', 'php', 'artisan', 'queue:work'], name)
    },
    listContainers: () => spec(['ps', '--all', '--quiet', '--filter', `label=${label}`]),
    removeContainers: ids => spec(['rm', '--force', ...ids]),
  }
}

function nativeRuntime(): ApiRuntime {
  const spec = (args: string[]): SpawnSpec => ({
    command: 'php',
    args: ['artisan', ...args],
    cwd: e2e.apiDir,
    env: { ...process.env, ...apiEnvironment },
  })

  return {
    name: 'native',
    artisan: spec,
    longRunning: role => role === 'api'
      ? spec(['serve', '--no-reload', '--host=127.0.0.1', `--port=${e2e.apiPort}`])
      : spec(['queue:work']),
    listContainers: () => null,
    removeContainers: () => {
      throw new Error('У способа native нет контейнеров.')
    },
  }
}

export const apiRuntime: ApiRuntime = e2e.runtime === 'docker' ? dockerRuntime() : nativeRuntime()
