import { api } from '@/lib/http'

const CONTAINERS_URL = '/api/docker/containers'
const UPDATE_OK_CONTROL = '\u0001ok'
const UPDATE_FAILED_CONTROL = '\u0001failed'
const UPDATE_TIMEOUT_MS = 360_000

export type ContainerAction = 'start' | 'stop' | 'restart' | 'update' | 'remove'

export type FileKind = 'compose' | 'env'

export type ContainerFileSet = Record<FileKind, string>

export type ContainerFilePaths = ContainerFileSet

export type DockerContainer = {
  id: string
  name: string
  image: string
  createdAt: string
  state: string
  running: boolean
  status: string
  health: 'healthy' | 'unhealthy' | 'starting' | null
  ports: string[]
  protected: boolean
  composeFile: string | null
}

export type DockerContainerMetrics = {
  cpuPercent: number | null
  memoryUsage: string | null
  memoryPercent: number | null
}

export type DockerDetailTab = 'logs' | 'compose' | 'env' | 'shell' | 'output'

export type DockerViewState = {
  containerName: string | null
  tab: DockerDetailTab
  showStopped: boolean
}

const DOCKER_VIEW_TABS = new Set<DockerDetailTab>(['logs', 'compose', 'env', 'shell', 'output'])

type DockerPsLine = {
  ID: string
  Names: string
  Image: string
  CreatedAt: string
  State: string
  Status: string
  Ports: string
  Labels: string
}

const STATE_LABELS: Record<string, string> = {
  running: 'Ativo',
  exited: 'Parado',
  created: 'Criado',
  paused: 'Pausado',
  restarting: 'Reiniciando',
  removing: 'Removendo',
  dead: 'Com falha',
}

const DURATION_REPLACEMENTS: [RegExp, string][] = [
  [/^about a minute/i, 'cerca de 1 minuto'],
  [/^about an hour/i, 'cerca de 1 hora'],
  [/^less than a second/i, 'menos de 1 segundo'],
  [/\bseconds?\b/, 'segundos'],
  [/\bminutes?\b/, 'minutos'],
  [/\bhours?\b/, 'horas'],
  [/\bdays?\b/, 'dias'],
  [/\bweeks?\b/, 'semanas'],
  [/\bmonths?\b/, 'meses'],
  [/\byears?\b/, 'anos'],
]

const CONFIG_FILES_LABEL = /(?:^|,)com\.docker\.compose\.project\.config_files=(.*?)(?=,[a-z0-9.-]+=|$)/

const ENV_ASSIGNMENT = /^(\s*(?:export\s+)?[^#=\s]+=).+$/gm
const ENV_VALUE_MASK = '********'

export const maskEnv = (text: string) => text.replace(ENV_ASSIGNMENT, `$1${ENV_VALUE_MASK}`)

export const stateLabel = (state: string) => STATE_LABELS[state] ?? state

function translateDuration(duration: string) {
  return DURATION_REPLACEMENTS.reduce((text, [pattern, value]) => text.replace(pattern, value), duration)
    .replace(/^1 (segundo|minuto|dia|ano)s/, '1 $1')
    .replace(/^1 horas/, '1 hora')
    .replace(/^1 semanas/, '1 semana')
    .replace(/^1 meses/, '1 mês')
}

function translateStatus(status: string) {
  const up = /^Up (.+?)(?: \((.+)\))?$/.exec(status)
  if (up) {
    const health = up[2] === 'healthy' ? ' (saudável)' : up[2] === 'unhealthy' ? ' (com problemas)' : ''
    return `Ativo há ${translateDuration(up[1])}${health}`
  }
  const exited = /^Exited \((\d+)\) (.+) ago$/.exec(status)
  if (exited) {
    const code = exited[1] === '0' ? '' : ` (código ${exited[1]})`
    return `Parado há ${translateDuration(exited[2])}${code}`
  }
  return status
}

function parsePorts(ports: string) {
  return ports
    .split(', ')
    .filter((port) => port && !port.startsWith('[::]'))
    .map((port) => port.replace('->', ' → ').replace('/tcp', ''))
}

function composeFileOf(labels: string) {
  return CONFIG_FILES_LABEL.exec(labels)?.[1].split(',')[0] || null
}

function formatCreatedAt(createdAt: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(createdAt)
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]} ${parts[4]}` : createdAt
}

function toContainer(line: DockerPsLine, selfId: string): DockerContainer {
  const health = /\((healthy|unhealthy|health: starting)\)/i.exec(line.Status)?.[1].toLowerCase()
  return {
    id: line.ID,
    name: line.Names,
    image: line.Image,
    createdAt: formatCreatedAt(line.CreatedAt),
    state: line.State,
    running: line.State === 'running',
    status: translateStatus(line.Status),
    health: health === 'healthy' || health === 'unhealthy' ? health : health === 'health: starting' ? 'starting' : null,
    ports: parsePorts(line.Ports),
    protected: selfId !== '' && line.ID.startsWith(selfId),
    composeFile: composeFileOf(line.Labels),
  }
}

function parsePercent(value: string | undefined) {
  const parsed = Number.parseFloat(value?.replace('%', '') ?? '')
  return Number.isFinite(parsed) ? parsed : null
}

export async function fetchContainerMetrics(id: string): Promise<DockerContainerMetrics> {
  const [, cpu, memoryUsage, memory] = (await api.get(`${CONTAINERS_URL}/${id}/metrics`).text('Falha ao consultar métricas do container')).trim().split('\t')
  return {
    cpuPercent: parsePercent(cpu),
    memoryUsage: memoryUsage || null,
    memoryPercent: parsePercent(memory),
  }
}

function encodeText(text: string) {
  const bytes = new TextEncoder().encode(text)
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
}

function decodeText(text: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(text), (character) => character.charCodeAt(0)))
}

const encodeFiles = (files: ContainerFileSet) => `${encodeText(files.compose)}\n${encodeText(files.env)}`

export async function fetchContainers(): Promise<DockerContainer[]> {
  const [selfId, ...lines] = (await api.get(CONTAINERS_URL).text('Falha ao consultar os containers')).split('\n')
  return lines
    .filter((line) => line.startsWith('{'))
    .map((line) => toContainer(JSON.parse(line), selfId))
    .sort((first, second) => first.name.localeCompare(second.name))
}

export async function fetchDockerViewState(): Promise<DockerViewState> {
  const response = await fetch('/api/docker/state')
  if (!response.ok) {
    return { containerName: null, tab: 'logs', showStopped: true }
  }
  const [containerName, tab, showStopped] = (await response.text()).split('\n')
  return {
    containerName: containerName || null,
    tab: DOCKER_VIEW_TABS.has(tab as DockerDetailTab) ? (tab as DockerDetailTab) : 'logs',
    showStopped: showStopped !== 'false',
  }
}

export function saveDockerViewState(containerName: string | null, tab: DockerDetailTab, showStopped: boolean) {
  return api.put('/api/docker/state').form({ container: containerName ?? '', tab, showStopped }).send('Não foi possível salvar a visualização dos contêineres.')
}

export function runContainerAction(id: string, action: ContainerAction) {
  return api.post(`${CONTAINERS_URL}/${id}/${action}`).send('Não foi possível executar a ação.')
}

export function streamContainerUpdate(id: string, onOutput: (text: string) => void) {
  return new Promise<boolean>((resolve, reject) => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const stream = new WebSocket(`${scheme}://${location.host}/api/docker/update?container=${id}`)
    let updated = false
    let settled = false

    function settle(fn: () => void) {
      if (settled) return
      settled = true
      fn()
    }

    const timer = setTimeout(() => {
      stream.close()
      settle(() => reject(new Error('Tempo limite de atualização excedido.')))
    }, UPDATE_TIMEOUT_MS)

    stream.onmessage = (event) => {
      if (event.data === UPDATE_OK_CONTROL) {
        updated = true
      } else if (event.data !== UPDATE_FAILED_CONTROL) {
        onOutput(event.data)
      }
    }

    stream.onclose = () => {
      clearTimeout(timer)
      settle(() => resolve(updated))
    }

    stream.onerror = () => {
      clearTimeout(timer)
      settle(() => resolve(false))
    }
  })
}

export async function fetchContainerFiles(
  id: string,
): Promise<{ paths: ContainerFilePaths; files: ContainerFileSet } | null> {
  const text = await api.get(`${CONTAINERS_URL}/${id}/files`).textOrNull(404, 'Não foi possível carregar os arquivos.')
  if (text === null) return null
  const [compose, env, composeContent, envContent] = text.split('\n')
  return {
    paths: { compose, env },
    files: { compose: decodeText(composeContent), env: decodeText(envContent) },
  }
}

export function saveContainerFiles(id: string, files: ContainerFileSet) {
  return api.put(`${CONTAINERS_URL}/${id}/files`).body(encodeFiles(files)).send('Não foi possível salvar os arquivos.')
}

export function createContainer(name: string, files: ContainerFileSet) {
  return api.post(`${CONTAINERS_URL}?name=${encodeURIComponent(name)}`).body(encodeFiles(files)).send('Não foi possível criar o container.')
}
