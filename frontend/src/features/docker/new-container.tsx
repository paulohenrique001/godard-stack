import { Suspense, useEffect, useState, type FormEvent } from 'react'
import type { IconType } from 'react-icons'
import { LuFileCode, LuFileKey } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { ContentLoader } from '@/components/ui/content-loader'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CodeEditor } from '@/features/docker/container-file-editor'
import { CopyPathButton } from '@/features/docker/copy-path-button'
import { createContainer, type ContainerFileSet, type FileKind } from '@/features/docker/docker-api'
import { fetchHealth } from '@/lib/api'
import { cn } from '@/lib/utils'

const FILE_TABS: { id: FileKind; label: string; icon: IconType }[] = [
  { id: 'compose', label: 'docker-compose.yml', icon: LuFileCode },
  { id: 'env', label: '.env', icon: LuFileKey },
]

const CONTAINER_NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/
const INITIAL_FILES: ContainerFileSet = {
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

type NewContainerProps = {
  onCancel: () => void
  onCreated: (composeFile: string) => Promise<void>
}

export function NewContainer({ onCancel, onCreated }: NewContainerProps) {
  const [name, setName] = useState('')
  const [files, setFiles] = useState(INITIAL_FILES)
  const [tab, setTab] = useState<FileKind>('compose')
  const [serviceFolder, setServiceFolder] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchHealth().then((result) => {
      if (!cancelled && result.kind === 'report') {
        setServiceFolder(result.report.serviceFolderPath ?? '')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const containerFolder = `${serviceFolder}/containers/${name || 'nome'}`
  const composePath = `${containerFolder}/docker-compose.yml`

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!CONTAINER_NAME.test(name)) {
      setError('Use letras minúsculas, números, hífen ou sublinhado.')
      return
    }
    setError('')
    setCreating(true)
    try {
      await createContainer(name, files)
      await onCreated(composePath)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível criar o container.')
      setCreating(false)
    }
  }

  return (
    <form className="animate-in fade-in flex h-full min-h-0 flex-col gap-4 p-6 duration-200" onSubmit={submit}>
      <h2 className="text-xl font-semibold tracking-tight">Novo container</h2>
      <div className="space-y-2">
        <Label htmlFor="container-name">Nome</Label>
        <Input
          id="container-name"
          autoFocus
          autoComplete="off"
          className="h-10 rounded-lg"
          placeholder="meu-container"
          value={name}
          onChange={(event) => setName(event.target.value.replace(/\s/g, '-'))}
        />
      </div>
      <div role="tablist" className="flex gap-1 border-b">
        {FILE_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === id ? 'border-highlight text-highlight' : 'border-transparent text-muted-foreground',
            )}
            onClick={() => setTab(id)}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-40 flex-1 overflow-hidden rounded-xl border bg-card">
        <Suspense fallback={<ContentLoader className="h-full" />}>
          <CodeEditor
            key={tab}
            value={files[tab]}
            language={tab === 'compose' ? 'yaml' : 'text'}
            label={tab === 'compose' ? 'Arquivo compose' : 'Arquivo .env'}
            onChange={(value) => setFiles((current) => ({ ...current, [tab]: value }))}
          />
        </Suspense>
      </div>
      {error && (
        <p role="alert" className="max-h-24 overflow-y-auto text-sm wrap-anywhere whitespace-pre-wrap text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <CopyPathButton path={tab === 'compose' ? composePath : `${containerFolder}/.env`} />
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="ghost" disabled={creating} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={creating}>
            {creating ? 'Criando...' : 'Criar'}
          </Button>
        </div>
      </div>
    </form>
  )
}
