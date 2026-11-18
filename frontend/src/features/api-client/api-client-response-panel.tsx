import { useMemo, useState, type ReactNode } from 'react'
import { LuCheck, LuClipboard, LuFileWarning, LuInbox, LuLoaderCircle } from 'react-icons/lu'
import type { ApiClientResponse } from '../../api'
import { formatBytes } from '../../shared/lib/format'

type ApiClientResponsePanelProps = {
  response: ApiClientResponse | null
  failure: string | null
  sending: boolean
  embedded?: boolean
}

export function ApiClientResponsePanel({
  response,
  failure,
  sending,
  embedded = false,
}: ApiClientResponsePanelProps) {
  const [tab, setTab] = useState<'body' | 'headers'>('body')
  const [copied, setCopied] = useState(false)
  const body = useMemo(() => formatBody(response), [response])

  const copyBody = async () => {
    if (!response?.body) return
    try {
      await navigator.clipboard.writeText(response.body)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section
      className={
        embedded
          ? 'flex h-full min-h-0 flex-col overflow-hidden bg-card'
          : 'mt-5 overflow-hidden rounded-xl border bg-card shadow-sm'
      }
      aria-labelledby="api-response"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <h3 id="api-response" className="font-semibold">
            Resposta
          </h3>
          {response && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(response.status)}`}
            >
              {response.status}
            </span>
          )}
          {response && (
            <span className="text-xs text-muted-foreground">
              {response.elapsedMs} ms · {formatBytes(response.sizeBytes)}
            </span>
          )}
        </div>
        {response && !response.binary && response.body && (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted"
            onClick={() => void copyBody()}
          >
            {copied ? (
              <LuCheck className="size-3.5 text-success" />
            ) : (
              <LuClipboard className="size-3.5" />
            )}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        )}
      </div>

      {sending ? (
        <div
          className="grid min-h-0 flex-1 place-items-center gap-3 p-6 text-sm text-muted-foreground"
          role="status"
        >
          <LuLoaderCircle className="size-5 animate-spin" />
          Aguardando a resposta da API…
        </div>
      ) : failure ? (
        <div
          className="grid min-h-0 flex-1 place-items-center gap-3 p-6 text-center text-sm text-destructive"
          role="alert"
        >
          <LuFileWarning className="size-6" />
          <p>{failure}</p>
        </div>
      ) : !response ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-muted-foreground">
          <LuInbox className="size-12 text-muted-foreground/50" strokeWidth={1.25} />
        </div>
      ) : response.binary ? (
        <div className="grid min-h-0 flex-1 place-items-center gap-3 p-6 text-center text-sm text-muted-foreground">
          <LuFileWarning className="size-6" />
          <p>Esta resposta é binária e não pode ser exibida neste MVP.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 border-b px-4">
            <ResponseTab selected={tab === 'body'} onClick={() => setTab('body')}>
              Corpo
            </ResponseTab>
            <ResponseTab selected={tab === 'headers'} onClick={() => setTab('headers')}>
              Headers ({response.headers.length})
            </ResponseTab>
          </div>
          {tab === 'body' ? (
            <pre className="min-h-0 flex-1 overflow-auto select-text bg-muted/35 p-4 font-mono text-xs leading-6 whitespace-pre-wrap">
              {body || 'Sem corpo na resposta.'}
            </pre>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {response.headers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum header retornado.</p>
              ) : (
                <dl className="divide-y rounded-lg border text-sm">
                  {response.headers.map((header, index) => (
                    <div
                      key={`${header.name}-${index}`}
                      className="grid gap-1 p-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)] sm:gap-4"
                    >
                      <dt className="font-mono text-xs font-medium text-muted-foreground">
                        {header.name}
                      </dt>
                      <dd className="break-all font-mono text-xs select-text">{header.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
          {response.truncated && (
            <p className="shrink-0 border-t bg-primary-soft px-4 py-3 text-xs text-highlight">
              A resposta foi limitada a 2 MB para manter o aplicativo responsivo.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function ResponseTab({
  selected,
  children,
  onClick,
}: {
  selected: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-selected={selected}
      className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors outline-none focus-visible:bg-muted focus-visible:text-highlight ${
        selected
          ? 'border-highlight text-highlight'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function formatBody(response: ApiClientResponse | null) {
  if (!response?.body || !response.contentType?.toLowerCase().includes('json')) {
    return response?.body ?? ''
  }
  try {
    return JSON.stringify(JSON.parse(response.body), null, 2)
  } catch {
    return response.body
  }
}

function statusTone(status: number) {
  if (status >= 200 && status < 300) return 'bg-success/15 text-success'
  if (status >= 300 && status < 400) return 'bg-primary-soft text-highlight'
  if (status >= 400 && status < 500) return 'bg-warning/15 text-warning'
  return 'bg-destructive/15 text-destructive'
}
