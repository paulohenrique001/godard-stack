import { type Update, check } from '@tauri-apps/plugin-updater'
import {
  LuArrowDownToLine,
  LuCheck,
  LuCircleAlert,
  LuLoaderCircle,
  LuPackageCheck,
  LuRefreshCw,
} from 'react-icons/lu'
import { useEffect, useState } from 'react'
import { type RuntimeStatus, type UpdateStatus, restartApplication, updateStatus } from '../../api'

type UpdatePanelProps = {
  runtime: RuntimeStatus
  className?: string
}

type UpdateState =
  | 'loading'
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'installing'
  | 'failed'

function supportMessage(support: UpdateStatus) {
  if (support.distribution === 'appimage' && support.configured) {
    return 'Canal estável assinado disponível para este AppImage.'
  }
  if (support.distribution === 'appimage') {
    return 'Este AppImage não foi gerado com um canal de atualização configurado.'
  }
  if (support.distribution === 'systemPackage') {
    return 'Pacotes .deb usam o APT quando o repositório estiver configurado; downloads avulsos são atualizados manualmente.'
  }
  return 'Atualizações internas só são verificadas em AppImages de release.'
}

export function UpdatePanel({ runtime, className }: UpdatePanelProps) {
  const [support, setSupport] = useState<UpdateStatus | null>(null)
  const [state, setState] = useState<UpdateState>('loading')
  const [available, setAvailable] = useState<Update | null>(null)
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null }>({
    downloaded: 0,
    total: null,
  })

  useEffect(() => {
    let active = true
    void updateStatus()
      .then((next) => {
        if (!active) return
        setSupport(next)
        setState('idle')
      })
      .catch(() => {
        if (active) setState('failed')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(
    () => () => {
      if (available) void available.close()
    },
    [available],
  )

  const canCheck = support?.distribution === 'appimage' && support.configured
  const checkForUpdates = async () => {
    if (!support || !canCheck) return
    setState('checking')
    setAvailable(null)
    try {
      const update = await check()
      if (update === null) {
        setState('current')
        return
      }
      setAvailable(update)
      setState('available')
    } catch {
      setState('failed')
    }
  }

  const install = async () => {
    if (!available) return
    setState('installing')
    setProgress({ downloaded: 0, total: null })
    try {
      await available.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          setProgress({ downloaded: 0, total: event.data.contentLength ?? null })
        }
        if (event.event === 'Progress') {
          setProgress((current) => ({
            ...current,
            downloaded: current.downloaded + event.data.chunkLength,
          }))
        }
      })
      await restartApplication()
    } catch {
      setState('failed')
    }
  }

  const percent =
    progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null

  return (
    <section className={`rounded-xl border bg-card p-5 shadow-sm ${className ?? ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <LuPackageCheck className="size-4 text-highlight" />
            Atualizações do aplicativo
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {support ? supportMessage(support) : 'Verificando o tipo de instalação...'}
          </p>
        </div>
        {support && (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            v{support.version}
          </span>
        )}
      </div>
      {state === 'available' && available && (
        <div className="mt-4 rounded-lg border border-success/25 bg-success/10 p-3 text-sm text-success">
          <p className="font-medium">Versão {available.version} disponível</p>
          {available.body && (
            <p className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-success/90">
              {available.body}
            </p>
          )}
        </div>
      )}
      {state === 'current' && (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-success">
          <LuCheck className="size-4" />
          Você já usa a versão mais recente.
        </p>
      )}
      {state === 'failed' && (
        <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-destructive">
          <LuCircleAlert className="size-4" />
          Não foi possível verificar atualizações agora.
        </p>
      )}
      {state === 'installing' && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <LuLoaderCircle className="size-4 animate-spin" />
              Baixando atualização...
            </span>
            <span>{percent === null ? 'Preparando' : `${percent}%`}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-highlight transition-[width]"
              style={{ width: `${percent ?? 8}%` }}
            />
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={
            !canCheck || state === 'loading' || state === 'checking' || state === 'installing'
          }
          className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          onClick={() => void checkForUpdates()}
        >
          {state === 'checking' ? (
            <LuLoaderCircle className="size-4 animate-spin" />
          ) : (
            <LuRefreshCw className="size-4" />
          )}
          Verificar atualizações
        </button>
        {state === 'available' && available && (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={() => void install()}
          >
            <LuArrowDownToLine className="size-4" />
            Baixar e reiniciar
          </button>
        )}
      </div>
    </section>
  )
}
