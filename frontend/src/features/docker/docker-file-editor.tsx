import { useEffect, useState } from 'react'
import { LuEye, LuFileX, LuLockOpen } from 'react-icons/lu'
import {
  type DockerComposeFiles,
  type DockerContainer,
  type RuntimeStatus,
  fetchDockerComposeFiles,
  saveDockerComposeFiles,
} from '../../api'
import { useExitGuard } from '../shell/exit-guard'
import { DockerCodeEditor } from './docker-code-editor'
import { DockerCopyPathButton } from './docker-copy-path-button'

export type DockerFileKind = 'compose' | 'env'

type DockerFileEditorProps = {
  runtime: RuntimeStatus
  container: DockerContainer
  kind: DockerFileKind
  onSaved: () => void
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Não foi possível salvar os arquivos de configuração.'
}

function maskEnv(text: string) {
  return text.replace(/^(\s*(?:export\s+)?[^#=\s]+=).+$/gm, '$1********')
}

export function DockerFileEditor({ runtime, container, kind, onSaved }: DockerFileEditorProps) {
  const [files, setFiles] = useState<DockerComposeFiles | null>(null)
  const [draft, setDraft] = useState<DockerComposeFiles | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [envUnlocked, setEnvUnlocked] = useState(false)

  useEffect(() => {
    let active = true
    setStatus('loading')
    setFiles(null)
    setDraft(null)
    setError('')
    setEnvUnlocked(false)
    fetchDockerComposeFiles(runtime, container.id)
      .then((value) => {
        if (!active) return
        setFiles(value)
        setDraft(value)
        setStatus('ready')
      })
      .catch((failure: unknown) => {
        if (!active) return
        const message = errorMessage(failure)
        setStatus(message.includes('não tem arquivo de configuração') ? 'missing' : 'failed')
      })
    return () => {
      active = false
    }
  }, [container.id, runtime.apiBase, runtime.sessionToken])

  if (status === 'loading') {
    return (
      <div className="grid min-h-48 flex-1 place-items-center text-sm text-muted-foreground">
        Carregando arquivos…
      </div>
    )
  }

  if (status !== 'ready' || files === null || draft === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border bg-card p-6 text-center">
        <LuFileX className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {status === 'missing'
            ? 'Este container não tem arquivo de configuração.'
            : 'Não foi possível ler os arquivos deste container.'}
        </p>
      </div>
    )
  }

  const dirty = draft.compose !== files.compose || draft.env !== files.env
  useExitGuard('docker-file-editor', dirty || saving)
  const envLocked = kind === 'env' && !envUnlocked && files.env.trim() !== ''
  const editorValue = envLocked ? maskEnv(draft.env) : draft[kind]
  const path = kind === 'compose' ? files.composePath : files.envPath

  const update = (value: string) => {
    if (envLocked) return
    setDraft((current) => (current === null ? current : { ...current, [kind]: value }))
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await saveDockerComposeFiles(runtime, container.id, draft)
      setFiles(draft)
      onSaved()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
        <DockerCodeEditor
          key={`${container.id}:${kind}:${envLocked}`}
          value={editorValue}
          language={kind === 'compose' ? 'yaml' : 'text'}
          label={kind === 'compose' ? 'Arquivo compose' : 'Arquivo .env'}
          readOnly={container.protectedContainer || envLocked}
          onChange={update}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="max-h-24 overflow-y-auto text-sm wrap-anywhere whitespace-pre-wrap text-destructive"
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <DockerCopyPathButton path={path} />
        {dirty && (
          <span role="status" className="mr-auto text-xs font-medium text-warning">
            Alterações não salvas
          </span>
        )}
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={!dirty || saving}
            className="h-9 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            onClick={() => {
              setDraft(files)
              setError('')
            }}
          >
            Descartar
          </button>
          {envLocked ? (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted"
              onClick={() => setEnvUnlocked(true)}
            >
              <LuLockOpen className="size-4" />
              Desbloquear
            </button>
          ) : (
            <button
              type="button"
              disabled={!dirty || saving || container.protectedContainer}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              onClick={() => void save()}
            >
              {kind === 'env' && <LuEye className="size-4" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
