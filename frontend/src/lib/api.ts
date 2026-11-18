import { api } from './http'

const USER_URL = '/api/user'
const HEALTH_URL = '/api/health'
const SEARCH_URL = '/api/search'

export type HealthReport = {
  database: 'ok' | 'fail'
  storage: 'ok' | 'fail'
  agent: 'online' | 'offline' | 'unauthorized'
  shell: 'ok' | 'fail' | 'unknown'
  agentUser: 'ok' | 'warn' | 'unknown'
  serviceFolder: 'ok' | 'unset' | 'missing' | 'incomplete' | 'denied' | 'unknown'
  serviceFolderPath?: string
}

export type HealthResult =
  | { kind: 'report'; report: HealthReport }
  | { kind: 'unreachable' }
  | { kind: 'forbidden' }

export async function fetchHealth(): Promise<HealthResult> {
  try {
    const response = await fetch(HEALTH_URL)
    if (response.status === 403) return { kind: 'forbidden' }
    if (!response.ok) return { kind: 'unreachable' }
    return { kind: 'report', report: await response.json() }
  } catch {
    return { kind: 'unreachable' }
  }
}

export const fetchUserName = (): Promise<string | null> =>
  api.get(USER_URL).textOrNull(404, 'Falha ao consultar o usuário')

export const saveUserName = (name: string): Promise<string> =>
  api.put(USER_URL).body(name).text('Falha ao salvar o usuário')

export const fetchAvatarSeed = (): Promise<string | null> =>
  api.get(`${USER_URL}/avatar-seed`).textOrNull(404, 'Falha ao consultar a foto')

export async function saveAvatarSeed(seed: string | null) {
  const req = seed === null ? api.del(`${USER_URL}/avatar-seed`) : api.put(`${USER_URL}/avatar-seed`).body(seed)
  await req.send('Falha ao salvar a foto')
}

export async function fetchInstalledTools(): Promise<string[]> {
  return (await api.get('/api/tools').text('Falha ao consultar as ferramentas')).split(',')
}

export type FolderListing = {
  path: string
  parent: string
  target: string
  folders: string[]
}

export async function fetchFolders(path = ''): Promise<FolderListing> {
  const text = await api.get(`/api/folders?path=${encodeURIComponent(path)}`).text('Falha ao listar as pastas')
  const [current, parent, target, ...folders] = text.split('\n')
  return { path: current, parent, target, folders }
}

export const saveServiceFolder = (path: string) =>
  api.put('/api/service-folder').body(path).send('Falha ao criar a pasta de serviço')

export type SearchHistory = {
  favorites: string[]
  recents: string[]
}

export type SearchList = keyof SearchHistory

export const fetchSearchHistory = (): Promise<SearchHistory> =>
  api.get(`${SEARCH_URL}/history`).json('Falha ao consultar o histórico')

export const updateSearchHistory = (list: SearchList, itemId: string, verb: 'PUT' | 'DELETE') =>
  api.request(verb, `${SEARCH_URL}/${list}/${itemId}`).send('Falha ao atualizar o histórico')

export type MachineInfo = {
  hostname: string
  user: string
  home: string
  os: string
  shell: string
  cpus: number
  memoryTotal: number
  memoryAvailable: number
  diskTotal?: number
  diskAvailable?: number
}

export async function fetchMachineInfo(): Promise<MachineInfo | null> {
  try {
    const response = await fetch('/api/machine')
    if (!response.ok) return null
    const lines = (await response.text()).split('\n').map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1)]
    })
    const info = Object.fromEntries(lines)
    return {
      ...info,
      cpus: Number(info.cpus),
      memoryTotal: Number(info.memoryTotal),
      memoryAvailable: Number(info.memoryAvailable),
      diskTotal: info.diskTotal ? Number(info.diskTotal) : undefined,
      diskAvailable: info.diskAvailable ? Number(info.diskAvailable) : undefined,
    }
  } catch {
    return null
  }
}

const TERMINALS_URL = '/api/terminals'

export type TerminalTabRecord = {
  id: number
  number: number
  active: boolean
  name: string | null
  cwd: string | null
  alive: boolean
}

const terminalRequest = (url: string, verb: string): Promise<TerminalTabRecord[]> =>
  api.request(verb, url).json('Falha ao atualizar as abas')

const terminalMutation = (url: string, verb: string) =>
  api.request(verb, url).send('Falha ao atualizar o console')

export const fetchTerminalTabs = () => terminalRequest(TERMINALS_URL, 'GET')
export const createTerminalTab = () => terminalRequest(TERMINALS_URL, 'POST')
export const deleteTerminalTab = (id: number) => terminalRequest(`${TERMINALS_URL}/${id}`, 'DELETE')
export const activateTerminalTab = (id: number) => terminalMutation(`${TERMINALS_URL}/${id}/active`, 'PUT')
export const clearTerminalTranscript = (id: number) => terminalMutation(`${TERMINALS_URL}/${id}/transcript`, 'DELETE')

export const renameTerminalTab = (id: number, name: string) =>
  api.put(`${TERMINALS_URL}/${id}/name`).body(name).send('Falha ao renomear a aba')

export const fetchTerminalTranscript = (id: number): Promise<string> =>
  api.get(`${TERMINALS_URL}/${id}/transcript`).text('Falha ao recuperar o histórico do console')

const COMMANDS_URL = '/api/commands'

export type SavedCommand = {
  id: number
  command: string
}

function commandRequest(url: string, verb: string, text?: string): Promise<SavedCommand[]> {
  const req = text !== undefined ? api.request(verb, url).body(text) : api.request(verb, url)
  return req.json('Falha ao atualizar os comandos')
}

export const fetchSavedCommands = () => commandRequest(COMMANDS_URL, 'GET')
export const createSavedCommand = (command: string) => commandRequest(COMMANDS_URL, 'POST', command)
export const updateSavedCommand = (id: number, command: string) => commandRequest(`${COMMANDS_URL}/${id}`, 'PUT', command)
export const deleteSavedCommand = (id: number) => commandRequest(`${COMMANDS_URL}/${id}`, 'DELETE')
