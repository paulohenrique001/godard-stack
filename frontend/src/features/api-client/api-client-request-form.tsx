import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { LuChevronDown, LuCircleCheck, LuCircleX, LuCopy, LuTrash2, LuWand } from 'react-icons/lu'
import type { ApiClientSavedRequest, ApiClientVariable } from '../../api'
import { ContextMenu, openContextMenu, type ContextMenuState } from './context-menu'
import { ApiClientAuthFields } from './api-client-auth-fields'
import { BodyEditor } from './api-client-body-editor'
import { ApiClientHeaderFields } from './api-client-header-fields'
import { ApiClientParameterFields } from './api-client-parameter-fields'

type RequestTab = 'params' | 'auth' | 'headers' | 'body'

type ApiClientRequestFormProps = {
  draft: ApiClientSavedRequest
  dirty: boolean
  sending: boolean
  saving: boolean
  onChange: (draft: ApiClientSavedRequest) => void
  onSave: () => void
  onSend: () => void
  variables?: ApiClientVariable[]
  onCreateVariable?: (name: string) => void
}

export function ApiClientRequestForm({
  draft,
  dirty,
  sending,
  saving,
  onChange,
  onSave,
  onSend,
  variables = [],
  onCreateVariable,
}: ApiClientRequestFormProps) {
  const [tab, setTab] = useState<RequestTab>('params')
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const disabled = sending || saving

  const update = (next: Partial<ApiClientSavedRequest>) => onChange({ ...draft, ...next })
  const updateRequest = (next: Partial<ApiClientSavedRequest['request']>) =>
    update({ request: { ...draft.request, ...next } })

  const contentTypeValue = draft.request.headers
    .find((h) => h.name.trim().toLowerCase() === 'content-type')
    ?.value?.toLowerCase() ?? ''
  const bodyMode: 'json' | 'xml' | 'text' = contentTypeValue.includes('xml')
    ? 'xml'
    : contentTypeValue.includes('text/plain')
    ? 'text'
    : 'json'

  const setBodyContentType = (contentType: string) => {
    const idx = draft.request.headers.findIndex(
      (h) => h.name.trim().toLowerCase() === 'content-type',
    )
    if (idx === -1) {
      updateRequest({ headers: [...draft.request.headers, { name: 'Content-Type', value: contentType }] })
    } else {
      updateRequest({
        headers: draft.request.headers.map((h, i) => (i === idx ? { ...h, value: contentType } : h)),
      })
    }
  }

  const bodyValid = useMemo(() => {
    const body = draft.request.body.trim()
    if (!body) return null
    if (bodyMode === 'json') {
      try { JSON.parse(body); return true } catch { return false }
    }
    if (bodyMode === 'xml') {
      const doc = new DOMParser().parseFromString(body, 'text/xml')
      return doc.getElementsByTagName('parsererror').length === 0
    }
    return null
  }, [draft.request.body, bodyMode])

  const formatJson = () => {
    if (!draft.request.body.trim()) return
    try {
      updateRequest({ body: JSON.stringify(JSON.parse(draft.request.body), null, 2) })
      setBodyError(null)
    } catch {
      setBodyError('O corpo não contém um JSON válido para formatação.')
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (dirty && !disabled) onSave()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      if (!disabled) onSend()
    }
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
    >
      <div
        role="tablist"
        aria-label="Configuração do request"
        className="flex items-center border-b px-2"
      >
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          <RequestTabButton selected={tab === 'params'} onClick={() => setTab('params')}>
            Params
          </RequestTabButton>
          <RequestTabButton selected={tab === 'auth'} onClick={() => setTab('auth')}>
            Auth
          </RequestTabButton>
          <RequestTabButton selected={tab === 'headers'} onClick={() => setTab('headers')}>
            Headers {draft.request.headers.length > 0 ? `(${draft.request.headers.length})` : ''}
          </RequestTabButton>
          <RequestTabButton selected={tab === 'body'} onClick={() => setTab('body')}>
            Body
          </RequestTabButton>
        </div>
        {tab === 'body' && (
          <div className="ml-2 flex shrink-0 items-center gap-2 pr-1">
            <BodyFormatSelector value={bodyMode} onChange={setBodyContentType} disabled={disabled} />
            {bodyMode === 'json' && (
              <button
                type="button"
                disabled={disabled || !draft.request.body.trim()}
                className="inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                onClick={formatJson}
              >
                Formatar
              </button>
            )}
          </div>
        )}
      </div>

      <div className={`min-h-0 flex-1 ${tab === 'body' ? 'flex flex-col overflow-hidden' : 'overflow-auto'}`}>
        {tab === 'params' && (
          <ApiClientParameterFields
            url={draft.request.url}
            disabled={disabled}
            onUrlChange={(url) => updateRequest({ url })}
            variables={variables}
            onCreateVariable={onCreateVariable}
          />
        )}
        {tab === 'auth' && (
          <ApiClientAuthFields
            authentication={draft.request.authentication}
            disabled={disabled}
            onChange={(authentication) => updateRequest({ authentication })}
            variables={variables}
            onCreateVariable={onCreateVariable}
          />
        )}
        {tab === 'headers' && (
          <ApiClientHeaderFields
            headers={draft.request.headers}
            disabled={disabled}
            onChange={(headers) => updateRequest({ headers })}
            variables={variables}
            onCreateVariable={onCreateVariable}
          />
        )}
        {tab === 'body' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="relative flex w-full min-h-0 flex-1 flex-col"
              onContextMenu={(e) => {
                const hasBody = draft.request.body.trim().length > 0
                openContextMenu(e, [
                  ...(bodyMode === 'json' ? [{ label: 'Formatar JSON', icon: <LuWand className="size-3.5" />, disabled: !hasBody, onClick: formatJson }] : []),
                  ...(bodyMode !== 'text' && hasBody ? [{ separator: true as const }] : []),
                  { label: 'Copiar body', icon: <LuCopy className="size-3.5" />, disabled: !hasBody, onClick: () => void navigator.clipboard.writeText(draft.request.body) },
                  { separator: true as const },
                  { label: 'Limpar body', icon: <LuTrash2 className="size-3.5" />, danger: true, disabled: !hasBody, onClick: () => { setBodyError(null); updateRequest({ body: '' }) } },
                ], setContextMenu)
              }}
            >
              <BodyEditor
                value={draft.request.body}
                mode={bodyMode}
                disabled={disabled}
                onChange={(body) => {
                  setBodyError(null)
                  updateRequest({ body })
                }}
              />
              {bodyValid !== null && (
                <span
                  className={`pointer-events-none absolute bottom-2 right-2 ${bodyValid ? 'text-success' : 'text-destructive'}`}
                  title={`${bodyMode.toUpperCase()} ${bodyValid ? 'válido' : 'inválido'}`}
                >
                  {bodyValid
                    ? <LuCircleCheck className="size-5" />
                    : <LuCircleX className="size-5" />
                  }
                </span>
              )}
            </div>
            {bodyError && (
              <p role="alert" className="shrink-0 px-4 pb-3 text-xs text-destructive">
                {bodyError}
              </p>
            )}
          </div>
        )}
      </div>
      {contextMenu !== null && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </form>
  )
}

const FORMAT_COLOR: Record<'json' | 'xml' | 'text', string> = {
  json: 'text-highlight',
  xml: 'text-warning',
  text: 'text-muted-foreground',
}

const FORMAT_OPTIONS: Array<{ label: string; value: 'json' | 'xml' | 'text'; contentType: string }> = [
  { label: 'JSON', value: 'json', contentType: 'application/json' },
  { label: 'XML', value: 'xml', contentType: 'application/xml' },
  { label: 'TEXT', value: 'text', contentType: 'text/plain' },
]

function BodyFormatSelector({
  value,
  onChange,
  disabled,
}: {
  value: 'json' | 'xml' | 'text'
  onChange: (contentType: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        className={`flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60 ${FORMAT_COLOR[value]}`}
        onClick={() => setOpen((o) => !o)}
      >
        {value.toUpperCase()}
        <LuChevronDown className="size-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`w-full rounded-md px-3 py-1.5 text-left text-xs font-semibold transition-colors hover:bg-muted ${FORMAT_COLOR[opt.value]} ${opt.value === value ? 'bg-muted' : ''}`}
              onClick={() => { onChange(opt.contentType); setOpen(false) }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function RequestTabButton({
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
      role="tab"
      aria-selected={selected}
      className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors outline-none focus-visible:bg-muted focus-visible:text-highlight ${
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

