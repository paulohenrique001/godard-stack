import { spawn, spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const WATCH_MODE = process.argv.includes('--watch')
const POLL_MS = 1000
const RESTART_BASE_MS = 1000
const MAX_RESTART_ATTEMPTS = 5
const POM = 'agent/pom.xml'
const SOURCES = 'agent/src'
const JAR = 'agent/target/godard-stack-agent.jar'
const JVM_OPTIONS = [
  '-XX:+UseSerialGC',
  '-XX:TieredStopAtLevel=1',
  '-Xss512k',
  '-Xms4m',
  '-Xmx16m',
  '-XX:MinHeapFreeRatio=10',
  '-XX:MaxHeapFreeRatio=25',
  '-XX:MaxMetaspaceSize=32m',
  '-XX:ReservedCodeCacheSize=12m',
]

let agent = null
let restarting = false
let restartAgain = false
let lastChange = 0
let restartTimer = null
let restartAttempts = 0
let shuttingDown = false

function build() {
  const maven = spawnSync('mvn', ['-B', '-q', '-f', POM, 'package'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return maven.status === 0
}

function stopAgent() {
  return new Promise((resolve) => {
    if (!agent) {
      resolve()
      return
    }
    agent.once('exit', () => resolve())
    agent.kill('SIGTERM')
  })
}

function startAgent() {
  const child = spawn('java', [...JVM_OPTIONS, '-jar', JAR, '.env'], { stdio: 'inherit' })
  child.once('exit', () => {
    if (agent === child) {
      agent = null
      if (!restarting && !shuttingDown) {
        scheduleRestart()
      }
    }
  })
  agent = child
  setTimeout(() => {
    if (agent === child) {
      restartAttempts = 0
    }
  }, 30_000)
}

function scheduleRestart() {
  if (restartTimer || restartAttempts >= MAX_RESTART_ATTEMPTS) {
    if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
      console.error('Agente encerrou repetidamente. Reinicie-o após verificar os logs.')
    }
    return
  }
  const delay = RESTART_BASE_MS * 2 ** restartAttempts
  restartAttempts += 1
  console.error(`Agente encerrado. Nova tentativa em ${delay / 1000} s.`)
  restartTimer = setTimeout(() => {
    restartTimer = null
    restart()
  }, delay)
}

async function restart() {
  if (restarting) {
    restartAgain = true
    return
  }
  restarting = true
  await stopAgent()
  if (build()) {
    startAgent()
  } else {
    console.error('Agente não compilou. Aguardando a próxima alteração.')
  }
  restarting = false
  if (restartAgain) {
    restartAgain = false
    restart()
  }
}

function latestChange() {
  const sources = readdirSync(SOURCES, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
  return Math.max(...[POM, ...sources].map((file) => statSync(file).mtimeMs))
}

function checkForChanges() {
  try {
    const change = latestChange()
    if (change !== lastChange) {
      lastChange = change
      restart()
    }
  } catch {
    return
  }
}

async function shutdown() {
  shuttingDown = true
  clearTimeout(restartTimer)
  await stopAgent()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

if (WATCH_MODE) {
  lastChange = latestChange()
  setInterval(checkForChanges, POLL_MS)
}

restart()
