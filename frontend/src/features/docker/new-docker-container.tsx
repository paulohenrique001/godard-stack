import {
  Fragment,
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  LuArrowUp,
  LuFileCode,
  LuFileKey,
  LuFolder,
  LuFolderOpen,
  LuLoaderCircle,
} from 'react-icons/lu'
import {
  type DockerFolderListing,
  type DockerServiceFolder,
  type RuntimeStatus,
  createDockerContainer,
  fetchDockerFolders,
  fetchDockerServiceFolder,
  saveDockerServiceFolder,
} from '../../api'
import { cn } from '../../shared/lib/cn'
import { useModalDialog } from '../accessibility/use-modal-dialog'
import { DockerCodeEditor } from './docker-code-editor'
import { DockerCopyPathButton } from './docker-copy-path-button'
import type { DockerFileKind } from './docker-file-editor'

const CONTAINER_NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/
const INITIAL_FILES = {
  compose: [
    'services:',
    '  nginx:',
    '    image: nginx:latest',
    '    restart: unless-stopped',
    '    ports:',
    '      - 8080:80',
    'networks: {}',
    '',
  ].join('\n'),
  env: ['# CONTAINER VARIABLES', '', 'VERSION=1.0.0', ''].join('\n'),
}

const FILE_TABS: Array<{ id: DockerFileKind; label: string; icon: typeof LuFileCode }> = [
  { id: 'compose', label: 'docker-compose.yml', icon: LuFileCode },
  { id: 'env', label: '.env', icon: LuFileKey },
]

function fileTabId(tab: DockerFileKind) {
  return `docker-new-service-tab-${tab}`
}

function filePanelId(tab: DockerFileKind) {
  return `docker-new-service-panel-${tab}`
}

type NewDockerContainerProps = {
  runtime: RuntimeStatus
  onCancel: () => void
  onCreated: (composePath: string) => Promise<void>
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível criar o container.'
}

export function NewDockerContainer({ runtime, onCancel, onCreated }: NewDockerContainerProps) {
  const [serviceFolder, setServiceFolder] = useState<DockerServiceFolder | null>(null)
  const [folderError, setFolderError] = useState('')
  const [name, setName] = useState('')
  const [files, setFiles] = useState(INITIAL_FILES)
  const [tab, setTab] = useState<DockerFileKind>('compose')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadFolder = () => {
    setFolderError('')
    void fetchDockerServiceFolder(runtime)
      .then(setServiceFolder)
      .catch((failure: unknown) => setFolderError(errorMessage(failure)))
  }

  useEffect(() => {
    loadFolder()
  }, [runtime.apiBase, runtime.sessionToken])

  if (serviceFolder === null) {
    return (
      <div className="grid h-full min-h-72 place-items-center p-6 text-sm text-muted-foreground">
        <LuLoaderCircle className="size-6 animate-spin" />
      </div>
    )
  }

  if (serviceFolder.path === null) {
    return (
      <ServiceFolderSetup
        runtime={runtime}
        error={folderError}
        onCancel={onCancel}
        onConfigured={loadFolder}
      />
    )
  }

  const folder = `${serviceFolder.path}/containers/${name || 'nome'}`
  const moveFileTab = (event: ReactKeyboardEvent<HTMLButtonElement>, current: DockerFileKind) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const currentIndex = FILE_TABS.findIndex((item) => item.id === current)
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? FILE_TABS.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + FILE_TABS.length) %
            FILE_TABS.length
    const next = FILE_TABS[nextIndex].id
    setTab(next)
    window.requestAnimationFrame(() => document.getElementById(fileTabId(next))?.focus())
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!CONTAINER_NAME.test(name)) {
      setError('Use letras minúsculas, números, hífen ou sublinhado.')
      return
    }
    setCreating(true)
    setError('')
    try {
      await createDockerContainer(runtime, name, files)
      await onCreated(`${serviceFolder.path}/containers/${name}/docker-compose.yml`)
    } catch (failure) {
      setError(errorMessage(failure))
      setCreating(false)
    }
  }

  return (
    <form
      className="animate-in fade-in flex h-full min-h-0 flex-col gap-4 p-6 duration-200"
      onSubmit={(event) => void submit(event)}
    >
      <h2 className="text-xl font-semibold tracking-tight">Novo container</h2>
      <div className="space-y-2">
        <label htmlFor="docker-container-name" className="text-sm font-medium">
          Nome
        </label>
        <input
          id="docker-container-name"
          autoFocus
          autoComplete="off"
          className="h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="meu-container"
          value={name}
          onChange={(event) => setName(event.target.value.replace(/\s/g, '-'))}
        />
      </div>
      <div
        role="tablist"
        aria-label="Arquivos do container"
        aria-orientation="horizontal"
        className="flex gap-1 border-b"
      >
        {FILE_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={fileTabId(id)}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={filePanelId(id)}
            tabIndex={tab === id ? 0 : -1}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === id
                ? 'border-highlight text-highlight'
                : 'border-transparent text-muted-foreground',
            )}
            onClick={() => setTab(id)}
            onKeyDown={(event) => moveFileTab(event, id)}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
      {FILE_TABS.map(({ id }) => (
        <div
          key={id}
          id={filePanelId(id)}
          role="tabpanel"
          aria-labelledby={fileTabId(id)}
          hidden={tab !== id}
          className="min-h-40 flex-1 overflow-hidden rounded-xl border bg-card"
        >
          {tab === id && (
            <DockerCodeEditor
              value={files[id]}
              language={id === 'compose' ? 'yaml' : 'text'}
              label={id === 'compose' ? 'Arquivo compose' : 'Arquivo .env'}
              onChange={(value) => setFiles((current) => ({ ...current, [id]: value }))}
            />
          )}
        </div>
      ))}
      {error && (
        <p
          role="alert"
          className="max-h-24 overflow-y-auto text-sm wrap-anywhere whitespace-pre-wrap text-destructive"
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <DockerCopyPathButton
          path={tab === 'compose' ? `${folder}/docker-compose.yml` : `${folder}/.env`}
        />
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={creating}
            className="h-9 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={creating}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>
    </form>
  )
}

function ServiceFolderSetup({
  runtime,
  error,
  onCancel,
  onConfigured,
}: {
  runtime: RuntimeStatus
  error: string
  onCancel: () => void
  onConfigured: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  return (
    <section className="animate-in fade-in flex h-full min-h-0 items-center justify-center p-6 duration-200">
      <div className="max-w-md space-y-4 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary-soft text-highlight">
          <LuFolderOpen className="size-7" />
        </span>
        <h2 className="text-xl font-semibold tracking-tight">Escolha a pasta de serviço</h2>
        <p className="text-sm text-muted-foreground">
          Os arquivos Compose criados pelo Godard ficarão dentro de{' '}
          <code>.godard-stack/containers</code> na pasta que você escolher.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-center gap-2">
          <button
            type="button"
            className="h-9 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={() => setPickerOpen(true)}
          >
            <LuFolder className="size-4" />
            Escolher pasta
          </button>
        </div>
      </div>
      {pickerOpen && (
        <ServiceFolderPicker
          runtime={runtime}
          onCancel={() => setPickerOpen(false)}
          onSelect={() => {
            setPickerOpen(false)
            onConfigured()
          }}
        />
      )}
    </section>
  )
}

function ServiceFolderPicker({
  runtime,
  onCancel,
  onSelect,
}: {
  runtime: RuntimeStatus
  onCancel: () => void
  onSelect: () => void
}) {
  const [listing, setListing] = useState<DockerFolderListing | null>(null)
  const [failed, setFailed] = useState('')
  const [saving, setSaving] = useState(false)
  const close = () => {
    if (!saving) onCancel()
  }
  const dialogRef = useModalDialog(true, close)

  const load = (path?: string) => {
    setFailed('')
    void fetchDockerFolders(runtime, path)
      .then(setListing)
      .catch((failure: unknown) => setFailed(errorMessage(failure)))
  }

  useEffect(() => {
    load()
  }, [runtime.apiBase, runtime.sessionToken])

  const select = async () => {
    if (listing === null) return
    setSaving(true)
    setFailed('')
    try {
      await saveDockerServiceFolder(runtime, listing.path)
      onSelect()
    } catch (failure) {
      setFailed(errorMessage(failure))
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={close}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="docker-folder-picker-title"
        className="w-full max-w-md rounded-2xl border bg-popover p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="docker-folder-picker-title" className="text-lg font-semibold tracking-tight">
          Escolher destino
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A pasta de serviço será criada dentro da pasta selecionada.
        </p>
        {listing === null ? (
          <div className="grid h-64 place-items-center">
            <LuLoaderCircle className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Fragment>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                aria-label="Ir para a pasta acima"
                disabled={!listing.parent}
                className="grid size-9 place-items-center rounded-lg border transition-colors hover:bg-muted disabled:opacity-50"
                onClick={() => load(listing.parent)}
              >
                <LuArrowUp className="size-4" />
              </button>
              <p title={listing.path} className="min-w-0 truncate text-sm font-medium">
                {listing.path}
              </p>
            </div>
            <ul className="mt-3 h-56 overflow-y-auto rounded-lg border p-1">
              {listing.folders.map((folder) => (
                <li key={folder}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
                    onClick={() => load(folder)}
                  >
                    <LuFolder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {folder.slice(listing.path.length).replace(/^\//, '')}
                    </span>
                  </button>
                </li>
              ))}
              {listing.folders.length === 0 && (
                <li className="px-2.5 py-2 text-sm text-muted-foreground">
                  Nenhuma subpasta aqui.
                </li>
              )}
            </ul>
            <p className="mt-2 truncate text-xs text-muted-foreground">
              Será criada: {listing.target}
            </p>
          </Fragment>
        )}
        {failed && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {failed}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
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
            type="button"
            disabled={listing === null || saving}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            onClick={() => void select()}
          >
            {saving ? 'Preparando...' : 'Selecionar pasta'}
          </button>
        </div>
      </section>
    </div>
  )
}
