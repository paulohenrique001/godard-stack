import { invoke } from '@tauri-apps/api/core'

export type Page =
  | 'dashboard'
  | 'todo'
  | 'api-client'
  | 'terminal'
  | 'sgbd'
  | 'docker'
  | 'settings'
  | 'activity'

export type RuntimeStatus = {
  status: 'starting' | 'ready' | 'failed'
  message?: string
  apiBase?: string
  sessionToken?: string
}

export type UserProfile = {
  name: string
  avatarSeed: string | null
  email: string | null
  language: string | null
}

export type Theme = 'light' | 'dark'

export type UserPreferences = {
  theme: Theme | 'system'
  lastPage: Page
  notificationsReadId: number
}

export type UpdateStatus = {
  distribution: 'development' | 'appimage' | 'systemPackage'
  configured: boolean
  version: string
}


export type SystemSnapshot = {
  hostname: string
  user: string
  operatingSystem: string
  processors: number
  loadAverage: number
  memoryTotal: number
  memoryAvailable: number
  diskTotal: number
  diskAvailable: number
  tools?: string[]
}

export type Activity = {
  id: number
  kind: string
  tone: string
  message: string
  createdAt: string
}

export type ModuleStatus = {
  id: 'terminal' | 'sgbd' | 'docker'
  label: string
  status: string
  detail: string
}

export type Bootstrap = {
  user: UserProfile | null
  preferences: UserPreferences
  system: SystemSnapshot
  activities: Activity[]
  modules: ModuleStatus[]
}

export type DashboardSnapshot = Pick<Bootstrap, 'system' | 'activities'>

export type TerminalAccess = {
  available: boolean
  accepted: boolean
  shell: string
  reason: string | null
}

export type TerminalTabRecord = {
  id: number
  number: number
  active: boolean
  name: string | null
  cwd: string | null
  alive: boolean
}

export type SavedCommand = {
  id: number
  command: string
}

export type TodoItem = {
  id: number
  title: string
  completed: boolean
  createdAt: string
  completedAt: string | null
}

export type TodoProject = {
  id: number
  icon: string
  name: string
  description: string
  sortOrder: number
  createdAt: string
}

export type TodoPage = {
  id: number
  projectId: number
  icon: string
  title: string
  content: string
  labelIds: number[]
  sortOrder: number
  dueDate: string | null
  createdAt: string
  updatedAt: string
}

export type TodoLabel = {
  id: number
  projectId: number
  name: string
  color: string
  sortOrder: number
  system: boolean
  createdAt: string
}

export type TodoList = {
  id: number
  projectId: number
  labelId: number
  description: string
  sortOrder: number
  createdAt: string
}

export type ApiClientMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ApiClientHeader = {
  name: string
  value: string
}

export type ApiClientAuthentication = {
  type: 'none' | 'bearer' | 'basic'
  token: string
  username: string
  password: string
}

export type ApiClientRequest = {
  method: ApiClientMethod
  url: string
  headers: ApiClientHeader[]
  body: string
  authentication: ApiClientAuthentication
}

export type ApiClientCollection = {
  id: number
  name: string
  description: string
}

export type ApiClientFolder = {
  id: number
  collectionId: number
  parentId: number | null
  name: string
}

export type ApiClientRequestSummary = {
  id: number
  collectionId: number | null
  folderId: number | null
  name: string
  method: ApiClientMethod
}

export type ApiClientSavedRequest = {
  id: number
  collectionId: number | null
  folderId: number | null
  name: string
  request: ApiClientRequest
}

export type ApiClientWorkspaceState = {
  openRequestIds: number[]
  activeRequestId: number | null
}

export type ApiClientVariable = {
  id: number
  collectionId: number
  name: string
  value: string
}

export type ApiClientWorkspace = {
  collections: ApiClientCollection[]
  folders: ApiClientFolder[]
  requests: ApiClientRequestSummary[]
  variables: ApiClientVariable[]
  viewState: ApiClientWorkspaceState
}

export type ApiClientRequestDraft = Omit<ApiClientSavedRequest, 'id'>

export type ApiClientResponse = {
  status: number
  headers: ApiClientHeader[]
  body: string
  contentType: string | null
  elapsedMs: number
  sizeBytes: number
  truncated: boolean
  binary: boolean
}

export type DockerAction = 'start' | 'stop' | 'restart' | 'remove'

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
  protectedContainer: boolean
  composeManaged: boolean
  composeFile: string | null
}

export type DockerMetrics = {
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

export type DockerComposeFiles = {
  composePath: string
  envPath: string
  compose: string
  env: string
}

export type DockerServiceFolder = {
  path: string | null
}

export type DockerFolderListing = {
  path: string
  parent: string
  target: string
  folders: string[]
}

export type SgbdKind = 'mariadb' | 'mysql' | 'redis'

export type SgbdConnection = {
  id: number
  name: string
  kind: SgbdKind
  label: string
  host: string
  port: number
  username: string
  hasPassword: boolean
  database: string
  ssl: boolean
  autoPing: boolean
  showAllSchemas: boolean
  showSystemSchemas: boolean
  selectedSchemas: string[]
  selected: boolean
}

export type SgbdConnectionDraft = {
  name: string
  kind: SgbdKind
  host: string
  port: number
  username: string
  password: string
  passwordChanged: boolean
  database: string
  ssl: boolean
  autoPing: boolean
  showAllSchemas: boolean
  showSystemSchemas: boolean
  selectedSchemas: string[]
}

export type SgbdHealth = {
  product: string
  latencyMs: number
}

export type SgbdQueryResult = {
  message: string
  columns: string[]
  rows: Array<Array<string | null>>
  affectedRows: number | null
  truncated: boolean
  elapsedMs: number
}

export type SgbdStructure = {
  schemas: Array<{
    name: string
    tables: Array<{
      name: string
      columns: Array<{
        name: string
        type: string
      }>
    }>
  }>
}

export type SgbdConsole = {
  id: number
  label: string
  database: string
  query: string
  editorPercent: number
  active: boolean
  outputLog: string
  savedResult: string
  resultsMinimized: boolean
}

export type SgbdConsoleUpdate = {
  label?: string
  database?: string | null
  query?: string
  editorPercent?: number
  outputLog?: string
  savedResult?: string
  resultsMinimized?: boolean
}

export const runtimeStatus = () => invoke<RuntimeStatus>('runtime_status')

export const retryRuntime = () => invoke<void>('retry_runtime')

export const updateStatus = () => invoke<UpdateStatus>('update_status')

export const restartApplication = () => invoke<void>('restart_application')

export const recoverBasic = () => invoke<void>('recover_basic')
export const recoverIntermediate = () => invoke<string>('recover_intermediate')
export const recoverAdvanced = () => invoke<string>('recover_advanced')

async function request<T>(runtime: RuntimeStatus, path: string, init?: RequestInit): Promise<T> {
  if (!runtime.apiBase || !runtime.sessionToken) {
    throw new Error('O serviço local ainda não está pronto.')
  }
  const response = await fetch(`${runtime.apiBase}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Godard-Session': runtime.sessionToken,
      ...init?.headers,
    },
  })
  if (!response.ok) {
    throw new Error(await responseError(response))
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>)
}

async function requestText(
  runtime: RuntimeStatus,
  path: string,
  init?: RequestInit,
): Promise<string> {
  if (!runtime.apiBase || !runtime.sessionToken) {
    throw new Error('O serviço local ainda não está pronto.')
  }
  const response = await fetch(`${runtime.apiBase}${path}`, {
    ...init,
    headers: {
      'X-Godard-Session': runtime.sessionToken,
      ...init?.headers,
    },
  })
  if (!response.ok) {
    throw new Error(await responseError(response))
  }
  return response.text()
}

async function responseError(response: Response) {
  const detail = (await response.text()).trim()
  if (!detail) return `A solicitação falhou (${response.status}).`
  try {
    const payload: unknown = JSON.parse(detail)
    if (payload && typeof payload === 'object' && 'detail' in payload) {
      const value = (payload as { detail?: unknown }).detail
      if (typeof value === 'string' && value) return value
    }
  } catch {
    return detail
  }
  return detail
}

export const fetchBootstrap = (runtime: RuntimeStatus) =>
  request<Bootstrap>(runtime, '/api/bootstrap')

export const fetchDashboard = (runtime: RuntimeStatus) =>
  request<DashboardSnapshot>(runtime, '/api/dashboard')

export const saveProfile = (runtime: RuntimeStatus, profile: UserProfile) =>
  request<UserProfile>(runtime, '/api/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  })

export const savePreferences = (runtime: RuntimeStatus, preferences: UserPreferences) =>
  request<UserPreferences>(runtime, '/api/preferences', {
    method: 'PUT',
    body: JSON.stringify({
      theme: preferences.theme,
      lastPage: preferences.lastPage,
      notificationsReadId: preferences.notificationsReadId,
    }),
  })

export const clearActivities = (runtime: RuntimeStatus) =>
  request<void>(runtime, '/api/activities', {
    method: 'DELETE',
  })

export const fetchTodoItems = (runtime: RuntimeStatus) => request<TodoItem[]>(runtime, '/api/todos')

export const createTodoItem = (runtime: RuntimeStatus, title: string) =>
  request<TodoItem>(runtime, '/api/todos', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })

export const updateTodoItem = (
  runtime: RuntimeStatus,
  item: Pick<TodoItem, 'id' | 'title' | 'completed'>,
) =>
  request<TodoItem>(runtime, `/api/todos/${item.id}`, {
    method: 'PUT',
    body: JSON.stringify({ title: item.title, completed: item.completed }),
  })

export const deleteTodoItem = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/todos/${id}`, {
    method: 'DELETE',
  })

export const fetchTodoProjects = (runtime: RuntimeStatus) =>
  request<TodoProject[]>(runtime, '/api/todo/projects')

export const createTodoProject = (
  runtime: RuntimeStatus,
  data: { icon: string; name: string; description: string },
) =>
  request<TodoProject>(runtime, '/api/todo/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateTodoProject = (
  runtime: RuntimeStatus,
  id: number,
  data: { icon: string; name: string; description: string },
) =>
  request<TodoProject>(runtime, `/api/todo/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deleteTodoProject = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/todo/projects/${id}`, {
    method: 'DELETE',
  })

export const fetchTodoPages = (runtime: RuntimeStatus, projectId: number) =>
  request<TodoPage[]>(runtime, `/api/todo/projects/${projectId}/pages`)

export const createTodoPage = (
  runtime: RuntimeStatus,
  projectId: number,
  data: { icon: string; title: string; content: string; labelIds: number[]; dueDate: string | null },
) =>
  request<TodoPage>(runtime, `/api/todo/projects/${projectId}/pages`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateTodoPage = (
  runtime: RuntimeStatus,
  id: number,
  data: { icon: string; title: string; content: string; labelIds: number[]; dueDate: string | null },
) =>
  request<TodoPage>(runtime, `/api/todo/pages/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const assignTodoPageLabels = (
  runtime: RuntimeStatus,
  id: number,
  labelIds: number[],
) =>
  request<TodoPage>(runtime, `/api/todo/pages/${id}/labels`, {
    method: 'PATCH',
    body: JSON.stringify({ labelIds }),
  })

export const reorderTodoPages = (runtime: RuntimeStatus, ids: number[]) =>
  request<void>(runtime, '/api/todo/pages/reorder', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  })

export const deleteTodoPage = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/todo/pages/${id}`, {
    method: 'DELETE',
  })

export const fetchTodoLabels = (runtime: RuntimeStatus, projectId: number) =>
  request<TodoLabel[]>(runtime, `/api/todo/projects/${projectId}/labels`)

export const createTodoLabel = (
  runtime: RuntimeStatus,
  projectId: number,
  data: { name: string; color: string },
) =>
  request<TodoLabel>(runtime, `/api/todo/projects/${projectId}/labels`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateTodoLabel = (
  runtime: RuntimeStatus,
  id: number,
  data: { name: string; color: string },
) =>
  request<TodoLabel>(runtime, `/api/todo/labels/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deleteTodoLabel = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/todo/labels/${id}`, { method: 'DELETE' })

export const fetchTodoLists = (runtime: RuntimeStatus, projectId: number) =>
  request<TodoList[]>(runtime, `/api/todo/projects/${projectId}/lists`)

export const createTodoList = (
  runtime: RuntimeStatus,
  projectId: number,
  data: { labelId: number; description: string },
) =>
  request<{ list: TodoList; label: TodoLabel }>(
    runtime,
    `/api/todo/projects/${projectId}/lists`,
    { method: 'POST', body: JSON.stringify(data) },
  )

export const updateTodoList = (
  runtime: RuntimeStatus,
  id: number,
  data: { labelId: number; description: string },
) =>
  request<{ list: TodoList; label: TodoLabel }>(
    runtime,
    `/api/todo/lists/${id}`,
    { method: 'PUT', body: JSON.stringify(data) },
  )

export const deleteTodoList = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/todo/lists/${id}`, { method: 'DELETE' })

export const reorderTodoLists = (runtime: RuntimeStatus, projectId: number, ids: number[]) =>
  request<void>(runtime, `/api/todo/projects/${projectId}/lists/order`, {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  })

export const executeApiClientRequest = (runtime: RuntimeStatus, payload: ApiClientRequest) =>
  request<ApiClientResponse>(runtime, '/api/client/execute', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const fetchApiClientWorkspace = (runtime: RuntimeStatus) =>
  request<ApiClientWorkspace>(runtime, '/api/client/workspace')

export const createApiClientCollection = (
  runtime: RuntimeStatus,
  input: Pick<ApiClientCollection, 'name' | 'description'>,
) =>
  request<ApiClientCollection>(runtime, '/api/client/collections', {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const updateApiClientCollection = (
  runtime: RuntimeStatus,
  id: number,
  input: Pick<ApiClientCollection, 'name' | 'description'>,
) =>
  request<ApiClientCollection>(runtime, `/api/client/collections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })

export const deleteApiClientCollection = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/client/collections/${id}`, {
    method: 'DELETE',
  })

export const createApiClientFolder = (
  runtime: RuntimeStatus,
  input: Pick<ApiClientFolder, 'collectionId' | 'parentId' | 'name'>,
) =>
  request<ApiClientFolder>(runtime, '/api/client/folders', {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const updateApiClientFolder = (runtime: RuntimeStatus, id: number, name: string) =>
  request<ApiClientFolder>(runtime, `/api/client/folders/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })

export const deleteApiClientFolder = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/client/folders/${id}`, {
    method: 'DELETE',
  })

export const fetchApiClientRequest = (runtime: RuntimeStatus, id: number) =>
  request<ApiClientSavedRequest>(runtime, `/api/client/requests/${id}`)

export const createApiClientRequest = (runtime: RuntimeStatus, draft: ApiClientRequestDraft) =>
  request<ApiClientSavedRequest>(runtime, '/api/client/requests', {
    method: 'POST',
    body: JSON.stringify(draft),
  })

export const updateApiClientRequest = (
  runtime: RuntimeStatus,
  id: number,
  draft: ApiClientRequestDraft,
) =>
  request<ApiClientSavedRequest>(runtime, `/api/client/requests/${id}`, {
    method: 'PUT',
    body: JSON.stringify(draft),
  })

export const deleteApiClientRequest = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/client/requests/${id}`, {
    method: 'DELETE',
  })

export const reorderApiClientCollections = (runtime: RuntimeStatus, ids: number[]) =>
  request<void>(runtime, '/api/client/collections/order', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  })

export const reorderApiClientFolders = (runtime: RuntimeStatus, ids: number[]) =>
  request<void>(runtime, '/api/client/folders/order', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  })

export const reorderApiClientRequests = (runtime: RuntimeStatus, ids: number[]) =>
  request<void>(runtime, '/api/client/requests/order', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  })

export const moveApiClientRequest = (
  runtime: RuntimeStatus,
  id: number,
  collectionId: number | null,
  folderId: number | null,
) =>
  request<ApiClientSavedRequest>(runtime, `/api/client/requests/${id}/move`, {
    method: 'PUT',
    body: JSON.stringify({ collectionId, folderId }),
  })

export const saveApiClientViewState = (runtime: RuntimeStatus, state: ApiClientWorkspaceState) =>
  request<ApiClientWorkspaceState>(runtime, '/api/client/workspace/state', {
    method: 'PUT',
    body: JSON.stringify(state),
  })

export const createApiClientVariable = (
  runtime: RuntimeStatus,
  collectionId: number,
  name: string,
  value: string,
) =>
  request<ApiClientVariable>(runtime, '/api/client/variables', {
    method: 'POST',
    body: JSON.stringify({ collectionId, name, value }),
  })

export const updateApiClientVariable = (
  runtime: RuntimeStatus,
  id: number,
  name: string,
  value: string,
) =>
  request<ApiClientVariable>(runtime, `/api/client/variables/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, value }),
  })

export const deleteApiClientVariable = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/client/variables/${id}`, { method: 'DELETE' })

export const fetchTerminalAccess = (runtime: RuntimeStatus) =>
  request<TerminalAccess>(runtime, '/api/terminal/access')

export const acceptTerminalAccess = (runtime: RuntimeStatus) =>
  request<TerminalAccess>(runtime, '/api/terminal/access', {
    method: 'PUT',
  })

export const fetchTerminalTabs = (runtime: RuntimeStatus) =>
  request<TerminalTabRecord[]>(runtime, '/api/terminals')

export const createTerminalTab = (runtime: RuntimeStatus) =>
  request<TerminalTabRecord[]>(runtime, '/api/terminals', {
    method: 'POST',
  })

export const deleteTerminalTab = (runtime: RuntimeStatus, id: number) =>
  request<TerminalTabRecord[]>(runtime, `/api/terminals/${id}`, {
    method: 'DELETE',
  })

export const activateTerminalTab = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/terminals/${id}/active`, {
    method: 'PUT',
  })

export const renameTerminalTab = (runtime: RuntimeStatus, id: number, name: string) =>
  request<void>(runtime, `/api/terminals/${id}/name`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: name,
  })

export const fetchTerminalTranscript = (runtime: RuntimeStatus, id: number) =>
  requestText(runtime, `/api/terminals/${id}/transcript`)

export const clearTerminalTranscript = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/terminals/${id}/transcript`, {
    method: 'DELETE',
  })

export const createTerminalTicket = (runtime: RuntimeStatus, id: number) =>
  request<{ ticket: string }>(runtime, `/api/terminals/${id}/ticket`, {
    method: 'POST',
  })

export function terminalSocketUrl(runtime: RuntimeStatus, id: number, ticket: string) {
  if (!runtime.apiBase) {
    throw new Error('O serviço local ainda não está pronto.')
  }
  const url = new URL('/api/terminal', runtime.apiBase)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('tab', String(id))
  url.searchParams.set('ticket', ticket)
  return url.toString()
}

export const fetchSavedCommands = (runtime: RuntimeStatus) =>
  request<SavedCommand[]>(runtime, '/api/commands')

export const createSavedCommand = (runtime: RuntimeStatus, command: string) =>
  request<SavedCommand>(runtime, '/api/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: command,
  })

export const updateSavedCommand = (runtime: RuntimeStatus, id: number, command: string) =>
  request<void>(runtime, `/api/commands/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: command,
  })

export const deleteSavedCommand = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/commands/${id}`, {
    method: 'DELETE',
  })

export const fetchDockerContainers = (runtime: RuntimeStatus) =>
  request<DockerContainer[]>(runtime, '/api/docker/containers')

export const fetchDockerMetrics = (runtime: RuntimeStatus, id: string) =>
  request<DockerMetrics>(runtime, `/api/docker/containers/${id}/metrics`)

export const runDockerAction = (runtime: RuntimeStatus, id: string, action: DockerAction) =>
  request<void>(runtime, `/api/docker/containers/${id}/${action}`, {
    method: 'POST',
  })

export const fetchDockerViewState = (runtime: RuntimeStatus) =>
  request<DockerViewState>(runtime, '/api/docker/state')

export const saveDockerViewState = (runtime: RuntimeStatus, state: DockerViewState) =>
  request<void>(runtime, '/api/docker/state', {
    method: 'PUT',
    body: JSON.stringify(state),
  })

export const createDockerLogTicket = (runtime: RuntimeStatus, id: string) =>
  request<{ ticket: string }>(runtime, `/api/docker/containers/${id}/logs/ticket`, {
    method: 'POST',
  })

export const createDockerShellTicket = (runtime: RuntimeStatus, id: string) =>
  request<{ ticket: string }>(runtime, `/api/docker/containers/${id}/shell/ticket`, {
    method: 'POST',
  })

export const createDockerUpdateTicket = (runtime: RuntimeStatus, id: string) =>
  request<{ ticket: string }>(runtime, `/api/docker/containers/${id}/update/ticket`, {
    method: 'POST',
  })

export const fetchDockerComposeFiles = (runtime: RuntimeStatus, id: string) =>
  request<DockerComposeFiles>(runtime, `/api/docker/containers/${id}/files`)

export const saveDockerComposeFiles = (
  runtime: RuntimeStatus,
  id: string,
  files: Pick<DockerComposeFiles, 'compose' | 'env'>,
) =>
  request<void>(runtime, `/api/docker/containers/${id}/files`, {
    method: 'PUT',
    body: JSON.stringify(files),
  })

export const createDockerContainer = (
  runtime: RuntimeStatus,
  name: string,
  files: Pick<DockerComposeFiles, 'compose' | 'env'>,
) =>
  request<void>(runtime, '/api/docker/containers', {
    method: 'POST',
    body: JSON.stringify({ name, ...files }),
  })

export const fetchDockerServiceFolder = (runtime: RuntimeStatus) =>
  request<DockerServiceFolder>(runtime, '/api/docker/service-folder')

export const fetchDockerFolders = (runtime: RuntimeStatus, path?: string) =>
  request<DockerFolderListing>(
    runtime,
    `/api/docker/folders${path ? `?path=${encodeURIComponent(path)}` : ''}`,
  )

export const saveDockerServiceFolder = (runtime: RuntimeStatus, parentPath: string) =>
  request<void>(runtime, '/api/docker/service-folder', {
    method: 'PUT',
    body: JSON.stringify({ parentPath }),
  })

export function dockerLogSocketUrl(runtime: RuntimeStatus, id: string, ticket: string) {
  if (!runtime.apiBase) {
    throw new Error('O serviço local ainda não está pronto.')
  }
  const url = new URL('/api/docker/logs', runtime.apiBase)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('container', id)
  url.searchParams.set('ticket', ticket)
  return url.toString()
}

function dockerSocketUrl(runtime: RuntimeStatus, path: string, id: string, ticket: string) {
  if (!runtime.apiBase) {
    throw new Error('O serviço local ainda não está pronto.')
  }
  const url = new URL(path, runtime.apiBase)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('container', id)
  url.searchParams.set('ticket', ticket)
  return url.toString()
}

export const dockerShellSocketUrl = (runtime: RuntimeStatus, id: string, ticket: string) =>
  dockerSocketUrl(runtime, '/api/docker/shell', id, ticket)

export const dockerUpdateSocketUrl = (runtime: RuntimeStatus, id: string, ticket: string) =>
  dockerSocketUrl(runtime, '/api/docker/update', id, ticket)

export const fetchSgbdConnections = (runtime: RuntimeStatus) =>
  request<SgbdConnection[]>(runtime, '/api/sgbd/connections')

export const createSgbdConnection = (runtime: RuntimeStatus, connection: SgbdConnectionDraft) =>
  request<SgbdConnection>(runtime, '/api/sgbd/connections', {
    method: 'POST',
    body: JSON.stringify(connection),
  })

export const updateSgbdConnection = (
  runtime: RuntimeStatus,
  id: number,
  connection: SgbdConnectionDraft,
) =>
  request<SgbdConnection>(runtime, `/api/sgbd/connections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(connection),
  })

export const deleteSgbdConnection = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/sgbd/connections/${id}`, {
    method: 'DELETE',
  })

export const selectSgbdConnection = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/sgbd/connections/${id}/selected`, {
    method: 'PUT',
  })

export const testSgbdConnection = (
  runtime: RuntimeStatus,
  connection: SgbdConnectionDraft,
  existingId?: number,
) =>
  request<SgbdHealth>(runtime, '/api/sgbd/test', {
    method: 'POST',
    body: JSON.stringify({ connection, existingId }),
  })

export const testSavedSgbdConnection = (runtime: RuntimeStatus, id: number) =>
  request<SgbdHealth>(runtime, `/api/sgbd/connections/${id}/test`, {
    method: 'POST',
  })

export const fetchSgbdStructure = (runtime: RuntimeStatus, id: number) =>
  request<SgbdStructure>(runtime, `/api/sgbd/connections/${id}/structure`)

export const fetchSgbdConsoles = (runtime: RuntimeStatus, id: number) =>
  request<SgbdConsole[]>(runtime, `/api/sgbd/connections/${id}/consoles`)

export const createSgbdConsole = (
  runtime: RuntimeStatus,
  connectionId: number,
  database?: string | null,
) =>
  request<SgbdConsole>(runtime, `/api/sgbd/connections/${connectionId}/consoles`, {
    method: 'POST',
    body: JSON.stringify({ database }),
  })

export const selectSgbdConsoleTab = (
  runtime: RuntimeStatus,
  connectionId: number,
  consoleId: number | null,
) =>
  request<void>(runtime, `/api/sgbd/connections/${connectionId}/active-tab`, {
    method: 'PUT',
    body: JSON.stringify({ consoleId }),
  })

export const updateSgbdConsole = (runtime: RuntimeStatus, id: number, console: SgbdConsoleUpdate) =>
  request<SgbdConsole>(runtime, `/api/sgbd/consoles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(console),
  })

export const deleteSgbdConsole = (runtime: RuntimeStatus, id: number) =>
  request<void>(runtime, `/api/sgbd/consoles/${id}`, {
    method: 'DELETE',
  })

export const executeSgbdCommand = (
  runtime: RuntimeStatus,
  id: number,
  command: string,
  database?: string | null,
) =>
  request<SgbdQueryResult>(runtime, `/api/sgbd/connections/${id}/execute`, {
    method: 'POST',
    body: JSON.stringify({ command, database }),
  })
