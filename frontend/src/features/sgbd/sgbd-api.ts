import type { Completion } from '@codemirror/autocomplete'
import type { SQLNamespace } from '@codemirror/lang-sql'
import { api } from '@/lib/http'
import { DRIVERS, type SchemaRow, type SgbdKind } from '@/features/sgbd/sgbd-drivers'

export type { SchemaRow, SgbdKind }

const CONNECTIONS_URL = '/api/sgbd/connections'

export type SgbdConnection = {
  id: number
  name: string
  kind: SgbdKind
  host: string
  port: number
  username: string
  hasPassword: boolean
  passwordMask: string
  database: string
  ssl: boolean
  autoPing: boolean
  autoPingFailures: number
  showAllSchemas: boolean
  showSystemSchemas: boolean
  selectedSchemas: string[]
}

export type ConnectionForm = {
  name: string
  kind: SgbdKind
  host: string
  port: string
  username: string
  password: string
  database: string
  ssl: boolean
  autoPing: boolean
  showAllSchemas: boolean
  showSystemSchemas: boolean
  selectedSchemas: string[]
}

export type ConnectionHealth = {
  version: string
  pingMs: number
}

export type ConnectionStatus =
  | { kind: 'checking' }
  | { kind: 'ok'; health: ConnectionHealth }
  | { kind: 'failed'; message: string }

export const DEFAULT_HOST = 'localhost'

export const generatedName = (host: string, kind: SgbdKind) => `${host.trim()}@${DRIVERS[kind].label}`

const formBody = (form: ConnectionForm, id?: number) => {
  const { selectedSchemas, ...fields } = form
  const body = new URLSearchParams({
    ...fields,
    ssl: String(form.ssl),
    autoPing: String(form.autoPing),
    showAllSchemas: String(form.showAllSchemas),
    showSystemSchemas: String(form.showSystemSchemas),
  })
  selectedSchemas.forEach((schema) => body.append('selectedSchema', schema))
  if (id !== undefined) {
    body.set('id', String(id))
  }
  return body
}

export function fetchConnections(): Promise<SgbdConnection[]> {
  return api.get(CONNECTIONS_URL).json('Falha ao consultar as conexões')
}

export function saveConnection(form: ConnectionForm, id?: number) {
  const url = id === undefined ? CONNECTIONS_URL : `${CONNECTIONS_URL}/${id}`
  return api.request(id === undefined ? 'POST' : 'PUT', url).form(formBody(form)).send('Confira os campos da conexão.')
}

export function deleteConnection(id: number) {
  return api.del(`${CONNECTIONS_URL}/${id}`).send('Não foi possível remover a conexão.')
}

export type SchemaListing = {
  rows: SchemaRow[]
  cached: boolean
  syncedAt: string
}

export async function fetchSchemas(connection: SgbdConnection, refresh = false): Promise<SchemaListing> {
  const query = refresh ? '?refresh=true' : ''
  const [header, ...lines] = (await api.get(`${CONNECTIONS_URL}/${connection.id}/schemas${query}`).text('Sem dados salvos para esta conexão.')).split('\n')
  const [source, syncedAt] = header.split('\t')
  return {
    rows: lines.filter(Boolean).map((line) => DRIVERS[connection.kind].parseSchema(line.split('\t'))),
    cached: source === 'cached',
    syncedAt,
  }
}

const pendingSchemaRefreshes = new Map<number, Promise<SchemaListing>>()

export function refreshSchemas(connection: SgbdConnection) {
  const pending = pendingSchemaRefreshes.get(connection.id)
  if (pending) return pending
  const request = fetchSchemas(connection, true).finally(() => pendingSchemaRefreshes.delete(connection.id))
  pendingSchemaRefreshes.set(connection.id, request)
  return request
}

export type SqlStructure = SQLNamespace

type TableNode = { self: Completion; children: Completion[] }
type SchemaNode = { self: Completion; children: Record<string, TableNode> }

export async function fetchStructure(connectionId: number): Promise<SqlStructure> {
  const response = await fetch(`${CONNECTIONS_URL}/${connectionId}/structure`)
  const structure: Record<string, SchemaNode> = {}
  if (!response.ok) return structure
  for (const line of (await response.text()).split('\n')) {
    const [schema, table, column, columnType] = line.split('\t')
    if (column) {
      structure[schema] ??= { self: { label: schema, type: 'namespace' }, children: {} }
      const tables = structure[schema].children
      tables[table] ??= { self: { label: table, type: 'class' }, children: [] }
      tables[table].children.push({ label: column, detail: columnType, type: 'property' })
    }
  }
  return structure
}

export function createSchema(connectionId: number, name: string) {
  return api.post(`${CONNECTIONS_URL}/${connectionId}/schemas`).form({ name }).send('Não foi possível criar o schema.')
}

export function dropSchema(connectionId: number, name: string) {
  return api.del(`${CONNECTIONS_URL}/${connectionId}/schemas/${encodeURIComponent(name)}`).send('Não foi possível remover o schema.')
}

export type SavedConsole = {
  id: number
  label: string
  schema: string | null
  query: string
  editorPercent: number
  active: boolean
  pageSize: number
  log: string
  results: string
  resultsMinimized: boolean
}

export async function fetchConsoles(connectionId: number): Promise<SavedConsole[]> {
  const response = await fetch(`${CONNECTIONS_URL}/${connectionId}/consoles`)
  return response.ok ? response.json() : []
}

export function createConsole(connectionId: number, schema: string | null): Promise<SavedConsole> {
  return api.post(`${CONNECTIONS_URL}/${connectionId}/consoles`).form(schema === null ? {} : { schema }).json('Falha ao criar o console.')
}

export function updateConsole(
  id: number,
  fields: {
    label?: string
    query?: string
    schema?: string
    editorPercent?: number
    pageSize?: number
    log?: string
    resultsMinimized?: boolean
  },
) {
  return api.put(`/api/sgbd/consoles/${id}`).form(fields).send('Não foi possível salvar o console.')
}

export function saveConsoleResults(id: number, results: string) {
  return api.put(`/api/sgbd/consoles/${id}/results`).body(results).send('Não foi possível salvar os resultados.')
}

export function saveActiveTab(connectionId: number, consoleId: number | null) {
  return api.put(`${CONNECTIONS_URL}/${connectionId}/active-tab`).form(consoleId === null ? {} : { console: consoleId }).send('Não foi possível salvar a aba ativa.')
}

export async function fetchConnectionToResume(): Promise<number | null> {
  const response = await fetch('/api/sgbd/resume')
  return response.status === 200 ? Number(await response.text()) : null
}

export function clearConnectionToResume() {
  return api.del('/api/sgbd/resume').send('Não foi possível limpar a conexão selecionada.')
}

export type ResultColumn = {
  name: string
  key: boolean
  numeric: boolean
}

export type ResultTable = {
  title: string
  columns: ResultColumn[]
  rows: (string | null)[][]
  truncated: boolean
  offset: number
  total: number | null
  paged: boolean
}

export type QueryResult = {
  at: string
  schema: string | null
  statement: string
  message: string
  failed: boolean
  table: ResultTable | null
}

export type ExecutionReport = {
  schema: string | null
  results: QueryResult[]
}

export function executeStatements(
  connectionId: number,
  schema: string | null,
  statements: string[],
  limit: number,
  offset = 0,
  requestId = crypto.randomUUID(),
): Promise<ExecutionReport> {
  const body = new URLSearchParams(schema === null ? {} : { schema })
  body.set('request', requestId)
  body.set('limit', String(limit))
  body.set('offset', String(offset))
  statements.forEach((statement) => body.append('statement', statement))
  return api.post(`${CONNECTIONS_URL}/${connectionId}/execute`).form(body).json('Não foi possível executar as queries.')
}

export function cancelExecution(connectionId: number, requestId: string) {
  return api.post(`${CONNECTIONS_URL}/${connectionId}/execute/${encodeURIComponent(requestId)}/cancel`).send('Não foi possível cancelar a execução.')
}

export function deleteConsole(id: number) {
  return api.del(`/api/sgbd/consoles/${id}`).send('Não foi possível remover o console.')
}

export const toForm = (connection: SgbdConnection): ConnectionForm => ({
  name: connection.name,
  kind: connection.kind,
  host: connection.host,
  port: String(connection.port),
  username: connection.username,
  password: '',
  database: connection.database,
  ssl: connection.ssl,
  autoPing: connection.autoPing,
  showAllSchemas: connection.showAllSchemas,
  showSystemSchemas: connection.showSystemSchemas,
  selectedSchemas: connection.selectedSchemas,
})

export async function testConnection(form: ConnectionForm, id?: number, automatic = false): Promise<ConnectionHealth> {
  const body = formBody(form, id)
  if (automatic) body.set('automatic', 'true')
  const [version, pingMs] = (await api.post('/api/sgbd/test').form(body).text('Não foi possível testar a conexão.')).split('\n')
  return { version: version.split('-')[0], pingMs: Number(pingMs) }
}
