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

interface LongRunning {
  role: LongRunningRole
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
  }

  try {
    console.log(`[e2e] API: ${apiRuntime.name}, база ${e2e.database}; журналы: ${e2e.logDir}`)

    // Остатки прошлого прерванного прогона (контейнеры с теми же именами).
    for (const role of ['api', 'worker'] as const) {
      const cleanup = apiRuntime.cleanup(role)
      if (cleanup) await run(cleanup, `очистка ${role}`, prepareLog, { allowFailure: true })
    }

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
    await stopAll()
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

// Запускает команду до завершения. Аргументы в сообщения не попадают: среди
// них пароль администратора для app:install.
function run(spec: SpawnSpec, label: string, log: WriteStream, options: { allowFailure?: boolean } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    log.write(`\n=== ${label} ===\n`)
    const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env: spec.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    const collect = (chunk: Buffer) => {
      output += chunk.toString()
      log.write(chunk)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', error => reject(new Error(`${label}: не удалось запустить ${spec.command} (${error.message})`)))
    child.on('close', (code) => {
      if (code === 0 || options.allowFailure) {
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
  return { role, child, log, exited }
}

async function waitForApi(api: LongRunning): Promise<void> {
  const deadline = Date.now() + 120_000
  let exited = false
  void api.exited.then(() => { exited = true })

  while (Date.now() < deadline) {
    if (exited) throw new Error(`API завершился до готовности, см. ${logPath('api')}`)
    try {
      const response = await fetch(`${e2e.apiOrigin}/api/v1/health`)
      if (response.ok) return
    } catch {
      // Сервер ещё не слушает порт.
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`API не ответил на /api/v1/health за 120 с, см. ${logPath('api')}`)
}

async function stop(running: LongRunning, log: WriteStream): Promise<void> {
  const cleanup = apiRuntime.cleanup(running.role)
  if (cleanup) await run(cleanup, `остановка ${running.role}`, log, { allowFailure: true })
  if (running.child.exitCode === null && running.child.signalCode === null) killTree(running.child)
  // Верхняя граница, а не пауза: обычно процесс выходит сразу после сигнала.
  const bound = new Promise<void>(resolve => setTimeout(resolve, 15_000).unref())
  await Promise.race([running.exited, bound])
  running.log.end()
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    // Группа уже завершилась.
  }
}
