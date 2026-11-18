import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LuCheck, LuCircle, LuDatabase, LuEye, LuEyeOff, LuLoaderCircle, LuPlugZap, LuX } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { ContentLoader } from '@/components/ui/content-loader'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KindSelect } from '@/features/sgbd/kind-select'
import {
  DEFAULT_HOST,
  fetchSchemas,
  refreshSchemas,
  generatedName,
  saveConnection,
  testConnection,
  toForm,
  type ConnectionForm as FormValues,
  type ConnectionHealth,
  type ConnectionStatus,
  type SchemaRow,
  type SgbdConnection,
  type SgbdKind,
} from '@/features/sgbd/sgbd-api'
import { DRIVERS } from '@/features/sgbd/sgbd-drivers'
import { cn } from '@/lib/utils'

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'ok' | 'failed'; message: string }
type EditorTab = 'general' | 'schemas'

type ConnectionFormProps = {
  connection?: SgbdConnection
  initialTab?: EditorTab
  onPing: (connection: SgbdConnection) => Promise<ConnectionStatus>
  onCancel: () => void
  onSaved: (id?: number, openSchemas?: boolean) => Promise<void>
}

const initialValues = (connection?: SgbdConnection): FormValues => {
  if (!connection) {
    return {
      ...DRIVERS.mariadb.defaults,
      name: generatedName(DEFAULT_HOST, 'mariadb'),
      kind: 'mariadb',
      host: DEFAULT_HOST,
      database: '',
      ssl: false,
      autoPing: false,
      showAllSchemas: true,
      showSystemSchemas: false,
      selectedSchemas: [],
    }
  }
  return toForm(connection)
}

const connectedMessage = (kind: SgbdKind, health: ConnectionHealth) =>
  `Conectado: ${DRIVERS[kind].label} ${health.version} · ${health.pingMs} MS`

function SwitchField({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className="flex h-10 items-center justify-between gap-2 rounded-lg border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => onChange(!checked)}
    >
      <span className="truncate">{label}</span>
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

function DialogTab({
  active,
  children,
  disabled = false,
  onClick,
}: {
  active: boolean
  children: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      className={cn(
        'border-b-2 px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'border-highlight text-highlight' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

type SchemaSettingsProps = {
  connection?: SgbdConnection
  values: FormValues
  onChange: <K extends keyof FormValues>(field: K, value: FormValues[K]) => void
}

function SchemaSettings({ connection, values, onChange }: SchemaSettingsProps) {
  const [schemas, setSchemas] = useState<SchemaRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!connection) {
      return
    }
    let cancelled = false
    setSchemas(null)
    setFailed(false)
    const load = async () => {
      try {
        const cached = await fetchSchemas(connection)
        if (cancelled) return
        setSchemas(cached.rows)
        if (!cached.cached) return
        try {
          const fresh = await refreshSchemas(connection)
          if (!cancelled) setSchemas(fresh.rows)
        } catch {
          // Os schemas salvos continuam disponíveis enquanto a atualização falha.
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [connection])

  const toggleSchema = (schema: string) => {
    if (values.showAllSchemas) {
      return
    }
    const selected = values.selectedSchemas.includes(schema)
      ? values.selectedSchemas.filter((item) => item !== schema)
      : [...values.selectedSchemas, schema]
    onChange('selectedSchemas', selected)
  }

  return (
    <div className="flex min-h-[24rem] flex-1 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <SwitchField
          label="Exibir todos"
          checked={values.showAllSchemas}
          disabled={!connection}
          onChange={(showAllSchemas) => onChange('showAllSchemas', showAllSchemas)}
        />
        <SwitchField
          label="Exibir schemas do sistema"
          checked={values.showSystemSchemas}
          onChange={(showSystemSchemas) => onChange('showSystemSchemas', showSystemSchemas)}
        />
      </div>
      <div aria-hidden="true" className="border-t" />
      {connection && schemas === null && !failed && <ContentLoader className="flex-1" />}
      {connection && failed && <p role="alert" className="text-sm text-destructive">Não foi possível carregar os schemas.</p>}
      {schemas !== null && (
        <div className="grid max-h-64 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
          {schemas.filter((schema) => values.showSystemSchemas || !schema.system).map((schema) => {
            const selected = values.showAllSchemas || values.selectedSchemas.includes(schema.name)
            return (
              <button
                key={schema.name}
                type="button"
                aria-pressed={selected}
                aria-label={`${selected ? 'Desmarcar' : 'Marcar'} ${schema.name}`}
                disabled={values.showAllSchemas}
                className={cn(
                  'flex min-h-20 items-center justify-between gap-3 rounded-xl border p-3 text-left outline-none transition-colors hover:border-highlight focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                  selected && 'border-highlight bg-primary-soft text-highlight',
                )}
                onClick={() => toggleSchema(schema.name)}
              >
                <span className="min-w-0 truncate text-sm font-medium" title={schema.name}>{schema.name}</span>
                {selected ? <LuCheck className="size-4 shrink-0" /> : <LuCircle className="size-4 shrink-0 text-muted-foreground" />}
              </button>
            )
          })}
          {schemas.filter((schema) => values.showSystemSchemas || !schema.system).length === 0 && (
            <div className="col-span-full flex min-h-24 items-center justify-center text-muted-foreground">
              <LuDatabase aria-label="Nenhum schema encontrado" className="size-5" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ConnectionForm({ connection, initialTab = 'general', onPing, onCancel, onSaved }: ConnectionFormProps) {
  const [values, setValues] = useState(() => initialValues(connection))
  const [activeTab, setActiveTab] = useState<EditorTab>(initialTab)
  const [nameEdited, setNameEdited] = useState(
    connection !== undefined && connection.name !== generatedName(connection.host, connection.kind),
  )
  const [showPassword, setShowPassword] = useState(false)
  const [test, setTest] = useState<TestState>({ status: connection ? 'testing' : 'idle' })
  const [showTesting, setShowTesting] = useState(false)
  const edited = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!connection) {
      return
    }
    onPing(connection).then((status) => {
      if (edited.current) {
        return
      }
      if (status.kind === 'ok') {
        setTest({ status: 'ok', message: connectedMessage(connection.kind, status.health) })
      } else if (status.kind === 'failed') {
        setTest({ status: 'failed', message: status.message })
      }
    })
  }, [connection, onPing])

  useEffect(() => {
    setShowTesting(false)
    if (test.status !== 'testing') {
      return
    }
    const timer = setTimeout(() => setShowTesting(true), 250)
    return () => clearTimeout(timer)
  }, [test.status])

  const touch = () => {
    edited.current = true
    setTest({ status: 'idle' })
  }

  const nameFor = (name: string, host: string, kind: SgbdKind) => (nameEdited ? name : generatedName(host, kind))

  const change = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    touch()
  }

  const changeName = (name: string) => {
    setNameEdited(name.trim() !== '')
    setValues((current) => ({ ...current, name: name.trim() === '' ? generatedName(current.host, current.kind) : name }))
    touch()
  }

  const changeHost = (host: string) => {
    setValues((current) => ({ ...current, host, name: nameFor(current.name, host, current.kind) }))
    touch()
  }

  const changeKind = (kind: SgbdKind) => {
    setValues((current) => {
      const previous = DRIVERS[current.kind].defaults
      const next = DRIVERS[kind].defaults
      return {
        ...current,
        kind,
        name: nameFor(current.name, current.host, kind),
        port: current.port === previous.port ? next.port : current.port,
        username: current.username === previous.username ? next.username : current.username,
        password: current.password === previous.password ? next.password : current.password,
      }
    })
    touch()
  }

  const runTest = async () => {
    edited.current = true
    setTest({ status: 'testing' })
    try {
      const health = await testConnection(values, connection?.id)
      setTest({ status: 'ok', message: connectedMessage(values.kind, health) })
    } catch (failure) {
      setTest({ status: 'failed', message: failure instanceof Error ? failure.message : 'Falha ao conectar.' })
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await saveConnection(values, connection?.id)
      await onSaved(connection?.id, connection === undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar.')
      setSaving(false)
    }
  }

  return (
    <form className="flex min-w-0 flex-col gap-4" onSubmit={submit}>
      <div role="tablist" aria-label="Configurações da conexão" className="flex gap-1 border-b">
        <DialogTab active={activeTab === 'general'} onClick={() => setActiveTab('general')}>Geral</DialogTab>
        <DialogTab active={activeTab === 'schemas'} disabled={!connection} onClick={() => setActiveTab('schemas')}>Schemas</DialogTab>
      </div>
      {activeTab === 'general' && (
        <>
          <div className="grid grid-cols-[11rem_1fr] gap-3">
            <div className="space-y-2">
              <Label htmlFor="connection-kind">Tipo</Label>
              <KindSelect id="connection-kind" value={values.kind} disabled={connection !== undefined} onChange={changeKind} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="connection-name">Nome</Label>
              <Input
                id="connection-name"
                autoComplete="off"
                className="h-10 rounded-lg"
                maxLength={60}
                value={values.name}
                onChange={(event) => changeName(event.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <div className="space-y-2">
              <Label htmlFor="connection-host">Host</Label>
              <Input
                id="connection-host"
                autoComplete="off"
                className="h-10 rounded-lg"
                value={values.host}
                onChange={(event) => changeHost(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="connection-port">Porta</Label>
              <Input
                id="connection-port"
                inputMode="numeric"
                autoComplete="off"
                className="h-10 rounded-lg"
                value={values.port}
                onChange={(event) => change('port', event.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="connection-user">Usuário</Label>
              <Input
                id="connection-user"
                autoComplete="off"
                className="h-10 rounded-lg"
                value={values.username}
                onChange={(event) => change('username', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="connection-password">Senha</Label>
              <div className="relative">
                <Input
                  id="connection-password"
                  autoComplete="off"
                  spellCheck={false}
                  className={cn('h-10 rounded-lg pr-10', !showPassword && '[-webkit-text-security:disc]')}
                  placeholder={connection?.passwordMask || undefined}
                  value={values.password}
                  onChange={(event) => change('password', event.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <LuEyeOff className="size-4" /> : <LuEye className="size-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="connection-database">{DRIVERS[values.kind].databaseField.label}</Label>
              <Input
                id="connection-database"
                autoComplete="off"
                className="h-10 rounded-lg"
                placeholder={DRIVERS[values.kind].databaseField.placeholder}
                value={values.database}
                onChange={(event) => change('database', event.target.value)}
              />
            </div>
            <SwitchField label="SSL" checked={values.ssl} onChange={(ssl) => change('ssl', ssl)} />
            <SwitchField label="Ping" checked={values.autoPing} onChange={(autoPing) => change('autoPing', autoPing)} />
          </div>
          <div className="h-11 overflow-y-auto text-sm">
            {test.status === 'testing' && <p className="text-muted-foreground">Conectando...</p>}
            {test.status === 'ok' && (
              <p role="status" className="flex items-center gap-1.5 text-success">
                <LuCheck className="size-4 shrink-0" />
                <span className="truncate">{test.message}</span>
              </p>
            )}
            {test.status === 'failed' && (
              <p role="alert" className="flex gap-1.5 text-destructive">
                <LuX className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 wrap-anywhere">{test.message}</span>
              </p>
            )}
          </div>
        </>
      )}
      {activeTab === 'schemas' && <SchemaSettings connection={connection} values={values} onChange={change} />}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-4">
        {activeTab === 'general' ? (
          <Button type="button" variant="outline" disabled={test.status === 'testing'} onClick={runTest}>
            {showTesting ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuPlugZap className="size-4" />}
            Testar conexão
          </Button>
        ) : <span />}
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={saving || !values.name.trim() || !values.host.trim() || !values.port}>
            {saving ? (connection ? 'Salvando...' : 'Criando...') : (connection ? 'Salvar' : 'Criar')}
          </Button>
        </div>
      </div>
    </form>
  )
}
