import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const ENV_FILE = '.env'
const LOOPBACK = '127.0.0.1'

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim()

function agentBind() {
  if (process.platform !== 'linux') {
    return LOOPBACK
  }
  if (docker('info', '--format', '{{.OperatingSystem}}').includes('Docker Desktop')) {
    return LOOPBACK
  }
  return docker('network', 'inspect', 'bridge', '--format', '{{range .IPAM.Config}}{{.Gateway}}{{end}}')
}

function ensureSecret(content, name) {
  const expression = new RegExp(`^${name}=.*$`, 'm')
  const existing = content.match(expression)?.[0]
  if (existing && existing !== `${name}=`) {
    return content
  }
  const value = `${name}=${randomBytes(32).toString('hex')}`
  return existing ? content.replace(expression, value) : `${content.trimEnd()}\n${value}\n`
}

if (existsSync(ENV_FILE)) {
  const existing = readFileSync(ENV_FILE, 'utf8')
  const updated = ensureSecret(existing, 'CONNECTION_ENCRYPTION_KEY')
  if (updated !== existing) {
    writeFileSync(ENV_FILE, updated, { mode: 0o600 })
    console.log('Chave de criptografia local criada')
  }
  process.exit(0)
}

const content = ensureSecret(readFileSync('.env.example', 'utf8'), 'CONNECTION_ENCRYPTION_KEY')
  .replace(/^AGENT_TOKEN=.*$/m, `AGENT_TOKEN=${randomBytes(32).toString('hex')}`)
  .replace(/^AGENT_BIND=.*$/m, `AGENT_BIND=${agentBind()}`)

writeFileSync(ENV_FILE, content, { mode: 0o600 })
console.log(`${ENV_FILE} criado`)
