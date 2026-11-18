import { lazy, Suspense, useEffect, useState } from 'react'
import { LuFileX } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { ContentLoader } from '@/components/ui/content-loader'
import { CopyPathButton } from '@/features/docker/copy-path-button'
import { maskEnv, type DockerContainer, type FileKind } from '@/features/docker/docker-api'
import type { ContainerFiles } from '@/features/docker/use-container-files'

export const CodeEditor = lazy(() => import('@/features/docker/code-editor'))

type LoadStatus = 'loading' | 'ready' | 'missing' | 'failed'

type ContainerFileEditorProps = {
  container: DockerContainer
  kind: FileKind
  files: ContainerFiles
}

export function ContainerFileEditor({ container, kind, files }: ContainerFileEditorProps) {
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [envUnlocked, setEnvUnlocked] = useState(false)
  const { load } = files

  useEffect(() => {
    let cancelled = false
    load(container)
      .then((found) => {
        if (!cancelled) {
          setStatus(found ? 'ready' : 'missing')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('failed')
        }
      })
    return () => {
      cancelled = true
    }
  }, [container.id, load])

  const draft = files.draftOf(container)
  const paths = files.pathsOf(container)

  if (status === 'loading') {
    return <ContentLoader className="min-h-48 flex-1" />
  }

  if (status !== 'ready' || draft === null || paths === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border bg-card p-6 text-center">
        <LuFileX className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {status === 'failed'
            ? 'Não foi possível ler os arquivos deste container.'
            : 'Este container não tem arquivo de configuração.'}
        </p>
      </div>
    )
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(files.savedOf(container))
  const envLocked = kind === 'env' && !envUnlocked && files.savedOf(container)?.env.trim() !== ''

  useEffect(() => {
    if (!dirty) {
      return
    }
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [dirty])

  const persist = async () => {
    setEnvUnlocked(true)
    setSaving(true)
    setError('')
    try {
      await files.save(container)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar.')
    }
    setSaving(false)
  }

  const discard = () => {
    setError('')
    files.discard(container)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
        <Suspense fallback={<ContentLoader className="h-full" />}>
          <CodeEditor
            key={`${container.id}:${kind}:${files.resets}:${envLocked}`}
            value={envLocked ? maskEnv(draft.env) : draft[kind]}
            language={kind === 'compose' ? 'yaml' : 'text'}
            label={kind === 'compose' ? 'Arquivo compose' : 'Arquivo .env'}
            readOnly={container.protected || envLocked}
            onChange={(value) => files.edit(container, kind, value)}
          />
        </Suspense>
      </div>
      {error && (
        <p role="alert" className="max-h-24 overflow-y-auto text-sm wrap-anywhere whitespace-pre-wrap text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <CopyPathButton path={paths[kind]} />
        {dirty && <span role="status" className="mr-auto text-xs font-medium text-warning">Alterações não salvas</span>}
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" disabled={!dirty || saving} onClick={discard}>
            Descartar
          </Button>
          {envLocked ? (
            <Button onClick={() => setEnvUnlocked(true)}>Desbloquear</Button>
          ) : (
            <Button disabled={!dirty || saving} onClick={persist}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
