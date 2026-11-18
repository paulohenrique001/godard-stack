import { type KeyboardEvent, type PointerEvent, useState } from 'react'
import { LuChevronDown, LuInbox, LuLoaderCircle, LuSend } from 'react-icons/lu'
import { Popover } from 'radix-ui'
import { cn } from '@/lib/utils'

const VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
type HttpVerb = (typeof VERBS)[number]

const VERB_COLOR: Record<HttpVerb, string> = {
  GET: 'text-green-500',
  POST: 'text-amber-500',
  PUT: 'text-blue-500',
  PATCH: 'text-orange-500',
  DELETE: 'text-red-500',
  HEAD: 'text-purple-500',
  OPTIONS: 'text-muted-foreground',
}

const VERBS_WITH_BODY = new Set<HttpVerb>(['POST', 'PUT', 'PATCH'])

type ResponseData = {
  status: number
  statusText: string
  body: string
  timeMs: number
}

const SPLIT_KEY = 'http-client-split'
const DEFAULT_SPLIT = 50
const MIN_SPLIT = 20
const MAX_SPLIT = 80

function loadSplit(): number {
  try {
    const v = localStorage.getItem(SPLIT_KEY)
    return v === null ? DEFAULT_SPLIT : Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, Number(v)))
  } catch {
    return DEFAULT_SPLIT
  }
}

function saveSplit(value: number) {
  try { localStorage.setItem(SPLIT_KEY, String(value)) } catch {}
}

function clamp(value: number) {
  return Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, Math.round(value)))
}

function statusClass(status: number) {
  if (status < 300) return 'bg-success/15 text-success'
  if (status < 400) return 'bg-blue-500/15 text-blue-500'
  if (status < 500) return 'bg-warning/15 text-warning'
  return 'bg-destructive/15 text-destructive'
}

function tryFormat(body: string, contentType: string) {
  if (contentType.includes('json')) {
    try { return JSON.stringify(JSON.parse(body), null, 2) } catch {}
  }
  return body
}

function VerbSelector({ value, onChange }: { value: HttpVerb; onChange: (v: HttpVerb) => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-full shrink-0 items-center gap-1.5 pl-3 pr-2 text-sm font-bold outline-none transition-colors hover:bg-muted',
            VERB_COLOR[value],
          )}
        >
          {value}
          <LuChevronDown className="size-3 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-32 overflow-hidden rounded-lg border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
        >
          {VERBS.map((verb) => (
            <Popover.Close asChild key={verb}>
              <button
                type="button"
                className={cn(
                  'w-full rounded-md px-3 py-1.5 text-left text-sm font-bold outline-none transition-colors hover:bg-muted',
                  VERB_COLOR[verb],
                  value === verb && 'bg-muted',
                )}
                onClick={() => onChange(verb)}
              >
                {verb}
              </button>
            </Popover.Close>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function HttpClientPage() {
  const [leftPercent, setLeftPercent] = useState(loadSplit)
  const [verb, setVerb] = useState<HttpVerb>('GET')
  const [url, setUrl] = useState('')
  const [body, setBody] = useState('')
  const [response, setResponse] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const splitAt = (event: PointerEvent<HTMLDivElement>) => {
    const { left, width } = event.currentTarget.parentElement!.getBoundingClientRect()
    return clamp(((event.clientX - left) / width) * 100)
  }

  const send = async () => {
    const target = url.trim()
    if (!target || loading) return
    setLoading(true)
    setError(null)
    setResponse(null)
    const t0 = performance.now()
    try {
      const res = await fetch(target, {
        method: verb,
        body: VERBS_WITH_BODY.has(verb) && body.trim() ? body.trim() : undefined,
      })
      const contentType = res.headers.get('content-type') ?? ''
      const text = await res.text()
      setResponse({
        status: res.status,
        statusText: res.statusText,
        body: tryFormat(text, contentType),
        timeMs: Math.round(performance.now() - t0),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') void send()
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Request panel */}
      <div className="flex min-w-0 flex-col" style={{ flex: `${leftPercent} 1 0` }}>
        <div className="border-b px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Requisição</span>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex h-10 items-center overflow-hidden rounded-lg border bg-card transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
            <VerbSelector value={verb} onChange={setVerb} />
            <div className="h-5 w-px shrink-0 bg-border" />
            <input
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={onKey}
              spellCheck={false}
            />
            <button
              type="button"
              disabled={!url.trim() || loading}
              aria-label="Enviar requisição"
              className="flex size-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              onClick={() => void send()}
            >
              {loading
                ? <LuLoaderCircle className="size-4 animate-spin" />
                : <LuSend className="size-4" />}
            </button>
          </div>
          {VERBS_WITH_BODY.has(verb) && (
            <textarea
              className="h-40 w-full resize-none rounded-lg border bg-card px-3 py-2 font-mono text-sm outline-none placeholder:text-muted-foreground transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder={'{\n  "chave": "valor"\n}'}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
            />
          )}
        </div>
      </div>

      {/* Draggable divider */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar largura dos painéis"
        className="group flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center"
        onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
          setLeftPercent(splitAt(e))
        }}
        onPointerUp={(e) => {
          const p = splitAt(e)
          setLeftPercent(p)
          saveSplit(p)
        }}
      >
        <span className="h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-highlight" />
      </div>

      {/* Response panel */}
      <div className="flex min-w-0 flex-col" style={{ flex: `${100 - leftPercent} 1 0` }}>
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Resposta</span>
          {response && (
            <>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', statusClass(response.status))}>
                {response.status} {response.statusText}
              </span>
              <span className="text-xs text-muted-foreground">{response.timeMs} ms</span>
            </>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          ) : response ? (
            <pre className="text-sm font-mono leading-relaxed whitespace-pre-wrap break-all">{response.body}</pre>
          ) : (
            <div className="flex h-full items-center justify-center">
              <LuInbox className="size-20 text-muted-foreground/40" strokeWidth={1.25} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
