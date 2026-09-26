import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import { apiRuntime, church, credentials, e2e, type LongRunningRole, type SpawnSpec } from './environment'

// Подготовка API сквозных тестов перед прогоном: чистая база `church_e2e`,
// установка системы, HTTP-сервер API и воркер очереди. Сервер предпросмотра
// Nuxt поднимает сам Playwright (webServer в playwright.config.ts).
//
// Порядок важен: сначала проверка, что процессы API действительно смотрят
// в базу и базы Redis сквозных тестов, и только потом разрушающие шаги.

// Пределы разовых команд. Обычно artisan в Docker отвечает за 7–10 с,
// первый migrate:fresh на холодном образе — до 45 с; зависшая команда
// (или демон Docker) не должна вешать прогон бессрочно.
const ARTISAN_TIMEOUT_MS = 180_000
const DOCKER_CLI_TIMEOUT_MS = 60_000
const API_READY_TIMEOUT_MS = 120_000
// Сколько ждать выхода долгоживущего процесса после сигнала остановки.
const STOP_GRACE_MS = 15_000

interface LongRunning {
  role: LongRunningRole
  spec: SpawnSpec
  child: ChildProcess
  log: WriteStream
  exited: Promise<void>
}

// Печатает фактическую конфигурацию, которую получат процессы API с
// переменными сквозных тестов (в том числе при закешированном конфиге, когда
// переменные окружения игнорируются). Сама ничего не меняет.
const GUARD_SCRIPT = [
  '$connection = config(\'database.default\');',
  'echo \'E2E_CONFIG=\'.json_encode([',
  '\'connection\' => $connection,',
  '\'database\' => config("database.connections.$connection.database"),',
  '\'hasUrl\' => filled(config("database.connections.$connection.url")),',
  '\'redis\' => (string) config(\'database.redis.default.database\'),',
  '\'redisCache\' => (string) config(\'database.redis.cache.database\'),',
  '\'configCached\' => app()->configurationIsCached(),',
  ']), PHP_EOL;',
].join(' ')

// Очередь (соединение default) и кеш (соединение cache) сквозных тестов
// очищаются целиком: номера этих баз Redis принадлежат только им.
const FLUSH_REDIS_SCRIPT = [
  'Illuminate\\Support\\Facades\\Redis::connection(\'default\')->flushdb();',
  'Illuminate\\Support\\Facades\\Redis::connection(\'cache\')->flushdb();',
].join(' ')

export default async function globalSetup(): Promise<() => Promise<void>> {
  mkdirSync(e2e.logDir, { recursive: true })
  const prepareLog = createWriteStream(join(e2e.logDir, 'prepare.log'))
  const started: LongRunning[] = []

  const stopAll = async () => {
    await Promise.all(started.map(running => stop(running, prepareLog)))
    started.length = 0
    // Всё, что осталось с меткой сквозных тестов, — тоже.
    await removeContainers(prepareLog, 'остановка')
  }

  try {
    console.log(`[e2e] API: ${apiRuntime.name}, база ${e2e.database}; журналы: ${e2e.logDir}`)

    // Контейнеры прошлого прогона, прерванного посреди разовой команды или
    // работы сервера, — по метке, независимо от имён. Иначе такой контейнер
    // с открытым соединением к church_e2e мог бы заблокировать migrate:fresh.
    const leftovers = await removeContainers(prepareLog, 'очистка')
    if (leftovers) console.log(`[e2e] Убраны контейнеры прерванного прогона: ${leftovers}`)

    await guardConfiguration(prepareLog)
    await run(apiRuntime.artisan(['tinker', `--execute=${FLUSH_REDIS_SCRIPT}`]), 'очистка Redis', prepareLog)
    await run(apiRuntime.artisan(['migrate:fresh', '--force']), 'migrate:fresh', prepareLog)
    await run(apiRuntime.artisan([
      'app:install',
      `--church-name=${church.name}`,
      `--timezone=${church.timezone}`,
      `--phone-region=${church.phoneRegion}`,
      `--last-name=${credentials.admin.lastName}`,
      `--first-name=${credentials.admin.firstName}`,
      `--login=${credentials.admin.login}`,
      `--password=${credentials.admin.password}`,
    ]), 'app:install', prepareLog)

    const api = startLongRunning('api')
    started.push(api)
    const worker = startLongRunning('worker')
    started.push(worker)

    await waitForApi(api)
    if (worker.child.exitCode !== null) {
      throw new Error(`Воркер очереди завершился при старте, см. ${logPath('worker')}`)
    }
    console.log(`[e2e] API готов: ${e2e.apiOrigin}`)
  } catch (error) {
    // Сбой уборки не должен заслонить исходную причину падения подготовки.
    await stopAll().catch((cleanupError: unknown) => {
      console.error('[e2e] Не удалось убрать процессы API:', cleanupError)
    })
    prepareLog.end()
    throw error
  }

  return async () => {
    await stopAll()
    prepareLog.end()
  }
}

async function guardConfiguration(log: WriteStream): Promise<void> {
  const output = await run(apiRuntime.artisan(['tinker', `--execute=${GUARD_SCRIPT}`]), 'проверка конфигурации', log)
  const line = output.split(/\r?\n/).find(candidate => candidate.startsWith('E2E_CONFIG='))
  if (!line) throw new Error('Проверка конфигурации API не напечатала результат, см. prepare.log.')

  const actual = JSON.parse(line.slice('E2E_CONFIG='.length)) as {
    connection: string
    database: string
    hasUrl: boolean
    redis: string
    redisCache: string
    configCached: boolean
  }
  const problems = [
    actual.connection !== 'pgsql' && `соединение ${actual.connection}, ожидалось pgsql`,
    actual.database !== e2e.database && `база ${actual.database}, ожидалась ${e2e.database}`,
    actual.hasUrl && 'задан DB_URL, он сильнее DB_DATABASE',
    actual.redis !== e2e.redisDatabase && `очередь в базе Redis ${actual.redis}, ожидалась ${e2e.redisDatabase}`,
    actual.redisCache !== e2e.redisCacheDatabase && `кеш в базе Redis ${actual.redisCache}, ожидалась ${e2e.redisCacheDatabase}`,
    actual.configCached && 'конфиг Laravel закеширован (bootstrap/cache/config.php), переменные окружения не действуют',
  ].filter(Boolean)

  if (problems.length) {
    throw new Error(`Подготовка остановлена до любых изменений: ${problems.join('; ')}.`)
  }
}

// Убирает все контейнеры с меткой сквозных тестов и возвращает их число.
async function removeContainers(log: WriteStream, purpose: string): Promise<number> {
  const found = await labelledContainers(log, purpose)
  if (!found.length) return 0
  try {
    await run(apiRuntime.removeContainers(found), `${purpose}: удаление ${found.length}`, log, { timeoutMs: DOCKER_CLI_TIMEOUT_MS })
  } catch (error) {
    // Контейнер с --rm мог успеть удалиться сам между списком и удалением;
    // ошибка важна, только если что-то действительно осталось.
    if ((await labelledContainers(log, `${purpose}, повторно`)).length) throw error
  }
  return found.length
}

async function labelledContainers(log: WriteStream, purpose: string): Promise<string[]> {
  const list = apiRuntime.listContainers()
  if (!list) return []
  const output = await run(list, `${purpose}: контейнеры с меткой`, log, { timeoutMs: DOCKER_CLI_TIMEOUT_MS })
  return output.split(/\s+/).filter(id => /^[0-9a-f]{12,64}$/.test(id))
}

// Запускает разовую команду до завершения, не дольше предела. Аргументы в
// сообщения не попадают: среди них пароль администратора для app:install.
function run(spec: SpawnSpec, label: string, log: WriteStream, options: { timeoutMs?: number } = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? ARTISAN_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    log.write(`\n=== ${label} ===\n`)
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    })
    let output = ''
    let timedOut = false
    const collect = (chunk: Buffer) => {
      output += chunk.toString()
      log.write(chunk)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)

    const timer = setTimeout(() => {
      timedOut = true
      log.write(`\n--- ${label}: превышен предел ${timeoutMs / 1000} с, процесс останавливается ---\n`)
      killTree(child, 'SIGKILL')
      removeOwnContainer(spec, log)
      reject(new Error(`${label}: не завершилась за ${timeoutMs / 1000} с. Процесс${spec.container ? ' и его контейнер' : ''} остановлены, вывод — в prepare.log.`))
    }, timeoutMs)

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`${label}: не удалось запустить ${spec.command} (${error.message})`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return
      if (code === 0) {
        resolve(output)
        return
      }
      const tail = output.trim().split(/\r?\n/).slice(-15).join('\n')
      reject(new Error(`${label}: код выхода ${code}. Конец вывода:\n${tail}`))
    })
  })
}

function logPath(role: LongRunningRole): string {
  return join(e2e.logDir, `${role}.log`)
}

function startLongRunning(role: LongRunningRole): LongRunning {
  const spec = apiRuntime.longRunning(role)
  const log = createWriteStream(logPath(role))
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Своя группа процессов на POSIX, чтобы остановить и дочерний `php -S`,
    // который порождает `artisan serve`.
    detached: process.platform !== 'win32',
    windowsHide: true,
  })
  child.stdout?.pipe(log, { end: false })
  child.stderr?.pipe(log, { end: false })
  const exited = new Promise<void>((resolve) => {
    child.on('close', () => resolve())
    child.on('error', (error) => {
      log.write(`\nНе удалось запустить ${spec.command}: ${error.message}\n`)
      resolve()
    })
  })
  return { role, spec, child, log, exited }
}

async function waitForApi(api: LongRunning): Promise<void> {
  const deadline = Date.now() + API_READY_TIMEOUT_MS
  let exited = false
  void api.exited.then(() => { exited = true })

  while (Date.now() < deadline) {
    if (exited) throw new Error(`API завершился до готовности, см. ${logPath('api')}`)
    try {
      const response = await fetch(`${e2e.apiOrigin}/api/v1/health`, { signal: AbortSignal.timeout(5_000) })
      if (response.ok) return
    } catch {
      // Сервер ещё не слушает порт.
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`API не ответил на /api/v1/health за ${API_READY_TIMEOUT_MS / 1000} с, см. ${logPath('api')}`)
}

async function stop(running: LongRunning, log: WriteStream): Promise<void> {
  removeOwnContainer(running.spec, log)
  if (isAlive(running.child)) killTree(running.child, 'SIGTERM')
  // Верхняя граница, а не пауза: обычно процесс выходит сразу после сигнала.
  const bound = new Promise<'bound'>(resolve => setTimeout(() => resolve('bound'), STOP_GRACE_MS).unref())
  if (await Promise.race([running.exited.then(() => 'exited' as const), bound]) === 'bound' && isAlive(running.child)) {
    killTree(running.child, 'SIGKILL')
  }
  running.log.end()
}

// Убирает контейнер, в котором шла команда, по его имени.
function removeOwnContainer(spec: SpawnSpec, log: WriteStream): void {
  if (!spec.container) return
  const result = spawnSync('docker', ['rm', '--force', spec.container], {
    encoding: 'utf8',
    timeout: DOCKER_CLI_TIMEOUT_MS,
    windowsHide: true,
  })
  log.write(`\n=== удаление контейнера ${spec.container} ===\n${result.stdout ?? ''}${result.stderr ?? ''}`)
}

function isAlive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}

function killTree(child: ChildProcess, signal: 'SIGTERM' | 'SIGKILL'): void {
  if (child.pid === undefined) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: DOCKER_CLI_TIMEOUT_MS })
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    // Группа уже завершилась.
  }
}
