import {
  Fragment,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  LuCheck,
  LuCircle,
  LuDatabase,
  LuEye,
  LuEyeOff,
  LuLoaderCircle,
  LuPlugZap,
  LuX,
} from 'react-icons/lu'
import {
  type RuntimeStatus,
  type SgbdConnection,
  type SgbdConnectionDraft,
  type SgbdHealth,
  type SgbdKind,
  createSgbdConnection,
  executeSgbdCommand,
  testSgbdConnection,
  updateSgbdConnection,
} from '../../api'
import { cn } from '../../shared/lib/cn'
import { useModalDialog } from '../accessibility/use-modal-dialog'
import { SgbdIcon } from './sgbd-icon'

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'success'; health: SgbdHealth }
  | { status: 'failed'; message: string }

export type ConnectionDialogTab = 'general' | 'schemas'

type ConnectionDialogProps = {
  runtime: RuntimeStatus
  connection: SgbdConnection | null
  initialTab?: ConnectionDialogTab
  onClose: () => void
  onSaved: (connection: SgbdConnection, showSchemas: boolean) => void
}

const KIND_OPTIONS: Array<{ value: SgbdKind; label: string }> = [
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'redis', label: 'Redis' },
]
const SQL_SYSTEM_SCHEMAS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys'])
const SQL_SCHEMAS_QUERY =
  'SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME'

function defaultsFor(kind: SgbdKind): Pick<SgbdConnectionDraft, 'port' | 'username' | 'database'> {
  return kind === 'redis'
    ? { port: 6379, username: '', database: '0' }
    : { port: 3306, username: 'root', database: '' }
}

function generatedName(host: string, kind: SgbdKind) {
  return `${host.trim() || 'localhost'}@${KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind}`
}

function defaultDraft(): SgbdConnectionDraft {
  return {
    name: generatedName('localhost', 'mariadb'),
    kind: 'mariadb',
    host: 'localhost',
    password: '',
    passwordChanged: false,
    ssl: false,
    autoPing: false,
    showAllSchemas: true,
    showSystemSchemas: false,
    selectedSchemas: [],
    ...defaultsFor('mariadb'),
  }
}

function draftFrom(connection: SgbdConnection): SgbdConnectionDraft {
  return {
    name: connection.name,
    kind: connection.kind,
    host: connection.host,
    port: connection.port,
    username: connection.username,
    password: '',
    passwordChanged: false,
    database: connection.database,
    ssl: connection.ssl,
    autoPing: connection.autoPing,
    showAllSchemas: connection.showAllSchemas,
    showSystemSchemas: connection.showSystemSchemas,
    selectedSchemas: connection.selectedSchemas,
  }
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}

function settingsTabId(tab: ConnectionDialogTab) {
  return `connection-settings-tab-${tab}`
}

function settingsPanelId(tab: ConnectionDialogTab) {
  return `connection-settings-panel-${tab}`
}

export function ConnectionDialog({
  runtime,
  connection,
  initialTab = 'general',
  onClose,
  onSaved,
}: ConnectionDialogProps) {
  const [draft, setDraft] = useState<SgbdConnectionDraft>(() =>
    connection ? draftFrom(connection) : defaultDraft(),
  )
  const [activeTab, setActiveTab] = useState<ConnectionDialogTab>(() =>
    connection ? initialTab : 'general',
  )
  const [nameEdited, setNameEdited] = useState(
    () =>
      connection !== null && connection.name !== generatedName(connection.host, connection.kind),
  )
  const [showPassword, setShowPassword] = useState(false)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const touched = useRef(false)
  const close = () => {
    if (!saving) onClose()
  }
  const dialogRef = useModalDialog(true, close)

  useEffect(() => {
    if (!connection) return
    let active = true
    setTest({ status: 'testing' })
    testSgbdConnection(runtime, draftFrom(connection), connection.id)
      .then((health) => {
        if (active && !touched.current) setTest({ status: 'success', health })
      })
      .catch((failure: unknown) => {
        if (active && !touched.current) setTest({ status: 'failed', message: messageFor(failure) })
      })
    return () => {
      active = false
    }
  }, [connection, runtime])

  const touch = () => {
    touched.current = true
    setTest({ status: 'idle' })
    setError('')
  }

  const update = <Key extends keyof SgbdConnectionDraft>(
    key: Key,
    value: SgbdConnectionDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }))
    touch()
  }

  const changeName = (name: string) => {
    setNameEdited(name.trim() !== '')
    setDraft((current) => ({
      ...current,
      name: name.trim() === '' ? generatedName(current.host, current.kind) : name,
    }))
    touch()
  }

  const changeHost = (host: string) => {
    setDraft((current) => ({
      ...current,
      host,
      name: nameEdited ? current.name : generatedName(host, current.kind),
    }))
    touch()
  }

  const changeKind = (kind: SgbdKind) => {
    setDraft((current) => {
      const previous = defaultsFor(current.kind)
      const next = defaultsFor(kind)
      return {
        ...current,
        kind,
        name: nameEdited ? current.name : generatedName(current.host, kind),
        port: current.port === previous.port ? next.port : current.port,
        username: current.username === previous.username ? next.username : current.username,
        database: current.database === previous.database ? next.database : current.database,
      }
    })
    touch()
  }

  const runTest = async () => {
    touched.current = true
    setTest({ status: 'testing' })
    setError('')
    try {
      setTest({
        status: 'success',
        health: await testSgbdConnection(runtime, draft, connection?.id),
      })
    } catch (failure) {
      setTest({ status: 'failed', message: messageFor(failure) })
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const saved = connection
        ? await updateSgbdConnection(runtime, connection.id, draft)
        : await createSgbdConnection(runtime, draft)
      onSaved(saved, connection === null)
    } catch (failure) {
      setError(messageFor(failure))
      setSaving(false)
    }
  }

  const databaseLabel = draft.kind === 'redis' ? 'Banco (número)' : 'Banco padrão'
  const databasePlaceholder = draft.kind === 'redis' ? '0' : 'Opcional'
  const tabs: ConnectionDialogTab[] = connection ? ['general', 'schemas'] : ['general']
  const moveTab = (event: ReactKeyboardEvent<HTMLButtonElement>, current: ConnectionDialogTab) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const currentIndex = tabs.indexOf(current)
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    const next = tabs[nextIndex]
    setActiveTab(next)
    window.requestAnimationFrame(() => document.getElementById(settingsTabId(next))?.focus())
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={close}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-dialog-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border bg-popover p-6 shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex flex-col gap-2 text-left">
          <h2
            id="connection-dialog-title"
            className={
              connection
                ? 'flex min-w-0 items-center justify-between gap-3 text-lg font-semibold'
                : 'text-lg font-semibold'
            }
          >
            {connection ? (
              <Fragment>
                <span className="truncate">{connection.name}</span>
                <DialogStatus test={test} />
              </Fragment>
            ) : (
              'Nova conexão'
            )}
          </h2>
          <p className="sr-only">Dados de acesso ao banco</p>
        </header>
        <form className="mt-4 flex min-w-0 flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <div
            role="tablist"
            aria-label="Configurações da conexão"
            aria-orientation="horizontal"
            className="flex gap-1 border-b"
          >
            <DialogTab
              id={settingsTabId('general')}
              panelId={settingsPanelId('general')}
              active={activeTab === 'general'}
              onClick={() => setActiveTab('general')}
              onKeyDown={(event) => moveTab(event, 'general')}
            >
              Geral
            </DialogTab>
            <DialogTab
              id={settingsTabId('schemas')}
              panelId={connection ? settingsPanelId('schemas') : undefined}
              active={activeTab === 'schemas'}
              disabled={!connection}
              onClick={() => setActiveTab('schemas')}
              onKeyDown={(event) => moveTab(event, 'schemas')}
            >
              Schemas
            </DialogTab>
          </div>
          <div
            id={settingsPanelId('general')}
            role="tabpanel"
            aria-labelledby={settingsTabId('general')}
            hidden={activeTab !== 'general'}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-[11rem_1fr] gap-3">
              <Field label="Tipo" htmlFor="connection-kind">
                <div className="relative">
                  <SgbdIcon
                    kind={draft.kind}
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  />
                  <select
                    id="connection-kind"
                    disabled={Boolean(connection)}
                    value={draft.kind}
                    onChange={(event) => changeKind(event.target.value as SgbdKind)}
                    className="h-10 w-full appearance-none rounded-lg border bg-transparent pr-3 pl-9 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted/50 disabled:opacity-70"
                  >
                    {KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field label="Nome" htmlFor="connection-name">
                <input
                  id="connection-name"
                  required
                  autoComplete="off"
                  className="field-input"
                  maxLength={60}
                  value={draft.name}
                  onChange={(event) => changeName(event.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <Field label="Host" htmlFor="connection-host">
                <input
                  id="connection-host"
                  required
                  autoComplete="off"
                  className="field-input"
                  maxLength={255}
                  value={draft.host}
                  onChange={(event) => changeHost(event.target.value)}
                />
              </Field>
              <Field label="Porta" htmlFor="connection-port">
                <input
                  id="connection-port"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  className="field-input tabular-nums"
                  value={draft.port || ''}
                  onChange={(event) =>
                    update('port', Number(event.target.value.replace(/\D/g, '')))
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Usuário" htmlFor="connection-username">
                <input
                  id="connection-username"
                  autoComplete="username"
                  className="field-input"
                  maxLength={200}
                  value={draft.username}
                  onChange={(event) => update('username', event.target.value)}
                />
              </Field>
              <Field label="Senha" htmlFor="connection-password">
                <div className="relative">
                  <input
                    id="connection-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    spellCheck={false}
                    className="field-input pr-10"
                    maxLength={512}
                    placeholder={connection?.hasPassword ? 'Senha salva' : undefined}
                    value={draft.password}
                    onChange={(event) => {
                      update('password', event.target.value)
                      update('passwordChanged', true)
                    }}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <LuEyeOff className="size-4" /> : <LuEye className="size-4" />}
                  </button>
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-3 items-end gap-3">
              <Field label={databaseLabel} htmlFor="connection-database">
                <input
                  id="connection-database"
                  autoComplete="off"
                  className="field-input"
                  maxLength={64}
                  placeholder={databasePlaceholder}
                  value={draft.database}
                  onChange={(event) => update('database', event.target.value)}
                />
              </Field>
              <SwitchField label="SSL" checked={draft.ssl} onChange={(ssl) => update('ssl', ssl)} />
              <SwitchField
                label="Ping"
                checked={draft.autoPing}
                onChange={(autoPing) => update('autoPing', autoPing)}
              />
            </div>
            <div className="h-11 overflow-y-auto text-sm">
              {test.status === 'testing' && (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <LuLoaderCircle className="size-4 animate-spin" />
                  Conectando...
                </p>
              )}
              {test.status === 'success' && (
                <p role="status" className="flex items-center gap-1.5 text-success">
                  <LuCheck className="size-4 shrink-0" />
                  <span className="truncate">
                    Conectado: {test.health.product} · {test.health.latencyMs} MS
                  </span>
                </p>
              )}
              {test.status === 'failed' && (
                <p role="alert" className="flex gap-1.5 text-destructive">
                  <LuX className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 wrap-anywhere">{test.message}</span>
                </p>
              )}
            </div>
          </div>
          {connection && (
            <div
              id={settingsPanelId('schemas')}
              role="tabpanel"
              aria-labelledby={settingsTabId('schemas')}
              hidden={activeTab !== 'schemas'}
            >
              {activeTab === 'schemas' && (
                <SchemaTab
                  runtime={runtime}
                  connection={connection}
                  draft={draft}
                  onChange={update}
                />
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            {activeTab === 'general' ? (
              <button
                type="button"
                disabled={test.status === 'testing' || saving}
                className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                onClick={() => void runTest()}
              >
                {test.status === 'testing' ? (
                  <LuLoaderCircle className="size-4 animate-spin" />
                ) : (
                  <LuPlugZap className="size-4" />
                )}
                Testar conexão
              </button>
            ) : (
              <span />
            )}
            <div className="flex shrink-0 gap-2">
              <button
                data-dialog-initial-focus
                type="button"
                disabled={saving}
                className="h-9 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                onClick={close}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !draft.name.trim() || !draft.host.trim() || !draft.port}
                className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {saving
                  ? connection
                    ? 'Salvando...'
                    : 'Criando...'
                  : connection
                    ? 'Salvar'
                    : 'Criar'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className="space-y-2">
      <span className="block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

function DialogTab({
  id,
  panelId,
  active,
  children,
  disabled = false,
  onClick,
  onKeyDown,
}: {
  id: string
  panelId?: string
  active: boolean
  children: string
  disabled?: boolean
  onClick: () => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      disabled={disabled}
      className={cn(
        'border-b-2 px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'border-highlight text-highlight'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </button>
  )
}

function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="flex h-10 items-center justify-between gap-2 rounded-lg border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span
        className={cn(
          'flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-primary dark:bg-highlight' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'size-4 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </button>
  )
}

function DialogStatus({ test }: { test: TestState }) {
  const style =
    test.status === 'success'
      ? 'bg-success/15 text-success'
      : test.status === 'failed'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-muted text-muted-foreground'
  const label =
    test.status === 'success'
      ? 'Conectado'
      : test.status === 'failed'
        ? 'Sem conexão'
        : 'Conectando...'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase',
        style,
      )}
    >
      {test.status === 'testing' && <LuLoaderCircle className="size-3 animate-spin" />}
      {label}
    </span>
  )
}

type DialogSchema = {
  name: string
  system: boolean
}

function SchemaTab({
  runtime,
  connection,
  draft,
  onChange,
}: {
  runtime: RuntimeStatus
  connection: SgbdConnection
  draft: SgbdConnectionDraft
  onChange: <Key extends keyof SgbdConnectionDraft>(
    key: Key,
    value: SgbdConnectionDraft[Key],
  ) => void
}) {
  const [schemas, setSchemas] = useState<DialogSchema[] | null>(null)
  const [failed, setFailed] = useState(false)
  const runtimeKey = `${runtime.status}:${runtime.apiBase ?? ''}:${runtime.sessionToken ?? ''}`

  useEffect(() => {
    let active = true
    setSchemas(null)
    setFailed(false)
    const command = connection.kind === 'redis' ? 'INFO keyspace' : SQL_SCHEMAS_QUERY
    executeSgbdCommand(runtime, connection.id, command)
      .then((result) => {
        if (active) setSchemas(parseSchemas(connection.kind, result.rows))
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [connection.id, connection.kind, runtimeKey])

  const toggleSchema = (name: string) => {
    if (draft.showAllSchemas) return
    const selected = draft.selectedSchemas.includes(name)
      ? draft.selectedSchemas.filter((item) => item !== name)
      : [...draft.selectedSchemas, name]
    onChange('selectedSchemas', selected)
  }

  const visibleSchemas =
    schemas?.filter((schema) => draft.showSystemSchemas || !schema.system) ?? []

  return (
    <div className="flex min-h-72 flex-1 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <SwitchField
          label="Exibir todos"
          checked={draft.showAllSchemas}
          onChange={(showAllSchemas) => onChange('showAllSchemas', showAllSchemas)}
        />
        <SwitchField
          label="Exibir schemas do sistema"
          checked={draft.showSystemSchemas}
          onChange={(showSystemSchemas) => onChange('showSystemSchemas', showSystemSchemas)}
        />
      </div>
      <div aria-hidden="true" className="border-t" />
      {schemas === null && !failed && (
        <div className="grid min-h-40 flex-1 place-items-center">
          <LuLoaderCircle
            aria-label="Carregando schemas"
            className="size-6 animate-spin text-muted-foreground/50"
          />
        </div>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar os schemas.
        </p>
      )}
      {schemas !== null && (
        <div className="grid max-h-64 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
          {visibleSchemas.map((schema) => {
            const selected = draft.showAllSchemas || draft.selectedSchemas.includes(schema.name)
            return (
              <button
                key={schema.name}
                type="button"
                aria-pressed={selected}
                aria-label={`${selected ? 'Desmarcar' : 'Marcar'} ${schema.name}`}
                disabled={draft.showAllSchemas}
                className={cn(
                  'flex min-h-20 items-center justify-between gap-3 rounded-xl border p-3 text-left outline-none transition-colors hover:border-highlight focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                  selected && 'border-highlight bg-primary-soft text-highlight',
                )}
                onClick={() => toggleSchema(schema.name)}
              >
                <span className="min-w-0 truncate text-sm font-medium" title={schema.name}>
                  {schema.name}
                </span>
                {selected ? (
                  <LuCheck className="size-4 shrink-0" />
                ) : (
                  <LuCircle className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            )
          })}
          {visibleSchemas.length === 0 && (
            <div className="col-span-full flex min-h-24 items-center justify-center text-muted-foreground">
              <LuDatabase aria-label="Nenhum schema encontrado" className="size-5" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function parseSchemas(kind: SgbdKind, rows: Array<Array<string | null>>): DialogSchema[] {
  if (kind === 'redis') {
    return rows
      .flat()
      .join('\n')
      .split('\n')
      .flatMap((line) => {
        const match = /^db(\d+):/.exec(line.trim())
        return match ? [{ name: match[1], system: false }] : []
      })
  }
  return rows.flatMap((row) => {
    const name = row[0]?.trim()
    return name ? [{ name, system: SQL_SYSTEM_SCHEMAS.has(name.toLowerCase()) }] : []
  })
}
