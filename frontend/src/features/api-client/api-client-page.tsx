import { Fragment, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { LuBraces, LuChevronDown, LuCircleX, LuCopy, LuFilePlus2, LuFolder, LuFolderPlus, LuGripVertical, LuHistory, LuLoaderCircle, LuMousePointerClick, LuPanelRightClose, LuPanelRightOpen, LuPlus, LuSend, LuTrash2, LuX } from 'react-icons/lu'
import {
  createApiClientCollection,
  createApiClientFolder,
  createApiClientRequest,
  deleteApiClientCollection,
  deleteApiClientFolder,
  deleteApiClientRequest,
  executeApiClientRequest,
  fetchApiClientRequest,
  fetchApiClientWorkspace,
  moveApiClientRequest,
  reorderApiClientCollections,
  reorderApiClientFolders,
  reorderApiClientRequests,
  saveApiClientViewState,
  updateApiClientCollection,
  updateApiClientFolder,
  updateApiClientRequest,
  type ApiClientCollection,
  type ApiClientFolder,
  type ApiClientRequest,
  type ApiClientRequestSummary,
  type ApiClientResponse,
  type ApiClientSavedRequest,
  type ApiClientMethod,
  type ApiClientVariable,
  type ApiClientWorkspace,
  type RuntimeStatus,
} from '../../api'
import { ApiClientCollectionTree } from './api-client-collection-tree'
import { ContextMenu, openContextMenu, type ContextMenuState } from './context-menu'
import { ApiClientDialog } from './api-client-dialog'
import { ApiClientRequestForm } from './api-client-request-form'
import { ApiClientResponsePanel } from './api-client-response-panel'
import { VariableInput } from './variable-input'
import { VariableManager } from './variable-manager'
import { resolveVariables } from './variable-utils'
import { useExitGuard } from '../shell/exit-guard'

const SPLIT_KEY = 'api-client-split'
const DEFAULT_SPLIT = 55
const MIN_SPLIT = 25
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

function clampSplit(value: number) {
  return Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, Math.round(value)))
}

const SIDEBAR_KEY = 'api-client-sidebar'
const DEFAULT_SIDEBAR = 384
const MIN_SIDEBAR = 240

function loadSidebarWidth(): number {
  try {
    const v = localStorage.getItem(SIDEBAR_KEY)
    return v === null ? DEFAULT_SIDEBAR : Math.max(MIN_SIDEBAR, Number(v))
  } catch {
    return DEFAULT_SIDEBAR
  }
}

function saveSidebarWidth(value: number) {
  try { localStorage.setItem(SIDEBAR_KEY, String(value)) } catch {}
}

const METHODS: ApiClientMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const METHOD_COLOR: Record<ApiClientMethod, string> = {
  GET: 'text-success',
  POST: 'text-highlight',
  PUT: 'text-warning',
  PATCH: 'text-warning',
  DELETE: 'text-destructive',
}

function MethodSelector({
  value,
  onChange,
  disabled,
}: {
  value: ApiClientMethod
  onChange: (method: ApiClientMethod) => void
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
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        className={`flex h-10 min-w-[5.5rem] items-center justify-between gap-1.5 rounded-l-lg pl-3 pr-2 font-mono text-sm font-bold outline-none transition-colors hover:bg-muted disabled:opacity-60 ${METHOD_COLOR[value]}`}
        onClick={() => setOpen((o) => !o)}
      >
        {value}
        <LuChevronDown className="size-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-20 mt-1 overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
          {METHODS.map((method) => (
            <button
              key={method}
              type="button"
              className={`w-full rounded-md px-3 py-1.5 text-left font-mono text-sm font-bold outline-none transition-colors hover:bg-muted ${METHOD_COLOR[method]} ${method === value ? 'bg-muted' : ''}`}
              onClick={() => { onChange(method); setOpen(false) }}
            >
              {method}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TabPipe() {
  return <div className="h-5 w-px shrink-0 self-center bg-border/60" />
}

type ApiClientPageProps = {
  runtime: RuntimeStatus
}

type DialogState =
  | { kind: 'folder'; collectionId: number; parentId: number | null }
  | { kind: 'request'; collectionId: number | null; folderId: number | null; source: ApiClientSavedRequest }
  | { kind: 'rename-collection'; collection: ApiClientCollection }
  | { kind: 'rename-folder'; folder: ApiClientFolder }
  | { kind: 'delete-collection'; collection: ApiClientCollection }
  | { kind: 'delete-folder'; folder: ApiClientFolder }
  | { kind: 'delete-request'; request: ApiClientRequestSummary }
  | { kind: 'discard'; requestId: number }

const EMPTY_REQUEST: ApiClientRequest = {
  method: 'GET',
  url: '',
  headers: [{ name: 'Accept', value: 'application/json' }],
  body: '',
  authentication: { type: 'none', token: '', username: '', password: '' },
}

export function ApiClientPage({ runtime }: ApiClientPageProps) {
  const [leftPercent, setLeftPercent] = useState(loadSplit)
  const [workspace, setWorkspace] = useState<ApiClientWorkspace | null>(null)
  const [documents, setDocuments] = useState<Record<number, ApiClientSavedRequest>>({})
  const [dirty, setDirty] = useState<Set<number>>(new Set())
  const [responses, setResponses] = useState<Record<number, ApiClientResponse>>({})
  const [responseFailures, setResponseFailures] = useState<Record<number, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [dialogName, setDialogName] = useState('')
  const [dialogDescription, setDialogDescription] = useState('')
  const [dialogBusy, setDialogBusy] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth)
  const [closedHistory, setClosedHistory] = useState<Array<{ id: number; name: string; method: string }>>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [openCollectionIds, setOpenCollectionIds] = useState<number[]>([])
  const [frontCollectionId, setFrontCollectionId] = useState<number | null>(null)
  const [collectionSaving, setCollectionSaving] = useState(false)
  const [previewRequestId, setPreviewRequestId] = useState<number | null>(null)
  const [previewCollectionId, setPreviewCollectionId] = useState<number | null>(null)
  const [newRequestIds, setNewRequestIds] = useState<Set<number>>(new Set())
  const [newCollectionIds, setNewCollectionIds] = useState<Set<number>>(new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [variableManagerCollection, setVariableManagerCollection] = useState<{ id: number; name: string; initialName?: string } | null>(null)
  useExitGuard('api-client', dirty.size > 0 || sendingId !== null || savingId !== null)
  const historyRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFailure(null)
    try {
      const next = await fetchApiClientWorkspace(runtime)
      const entries = await Promise.all(
        next.viewState.openRequestIds.map(
          async (id) => [id, await fetchApiClientRequest(runtime, id)] as const,
        ),
      )
      setWorkspace(next)
      setDocuments(Object.fromEntries(entries))
      setDirty(new Set())
      setResponses({})
      setResponseFailures({})
    } catch (error) {
      setFailure(message(error, 'Não foi possível carregar o workspace de API.'))
    } finally {
      setLoading(false)
    }
  }, [runtime])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!historyOpen) return
    const close = (e: MouseEvent) => {
      if (!historyRef.current?.contains(e.target as Node)) setHistoryOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [historyOpen])

  const refreshWorkspace = useCallback(async () => {
    const next = await fetchApiClientWorkspace(runtime)
    setWorkspace(next)
    return next
  }, [runtime])

  const openVariableManager = (collectionId: number, initialName?: string) => {
    const col = workspace?.collections.find((c) => c.id === collectionId)
    if (!col) return
    setVariableManagerCollection({ id: collectionId, name: col.name, initialName })
  }

  const handleVariablesChange = (collectionId: number, variables: ApiClientVariable[]) => {
    setWorkspace((w) =>
      w
        ? { ...w, variables: [...w.variables.filter((v) => v.collectionId !== collectionId), ...variables] }
        : w,
    )
  }

  const persistTabs = useCallback(
    async (openRequestIds: number[], activeRequestId: number | null) => {
      const state = await saveApiClientViewState(runtime, { openRequestIds, activeRequestId })
      setWorkspace((current) => (current ? { ...current, viewState: state } : current))
      return state
    },
    [runtime],
  )

  const openRequest = async (id: number) => {
    if (!workspace) return
    setFrontCollectionId(null)
    const prevPreview = previewRequestId
    setPreviewRequestId(id)
    try {
      let request = documents[id]
      if (!request) {
        request = await fetchApiClientRequest(runtime, id)
        setDocuments((current) => ({ ...current, [id]: request }))
      }
      let openIds = workspace.viewState.openRequestIds
      if (prevPreview !== null && prevPreview !== id && !dirty.has(prevPreview)) {
        openIds = openIds.filter((rid) => rid !== prevPreview)
        setDocuments((curr) => { const { [prevPreview]: _, ...rest } = curr; return rest })
      }
      const ids = openIds.includes(id) ? openIds : [...openIds, id].slice(-12)
      await persistTabs(ids, id)
    } catch (error) {
      setFailure(message(error, 'Não foi possível abrir o request.'))
    }
  }

  const closeRequest = (id: number) => {
    if (newRequestIds.has(id) && !dirty.has(id)) {
      void deleteNewRequest(id)
      return
    }
    if (dirty.has(id)) {
      setDialog({ kind: 'discard', requestId: id })
      return
    }
    void closeRequestNow(id)
  }

  const deleteNewRequest = async (id: number) => {
    try {
      await deleteApiClientRequest(runtime, id)
      setNewRequestIds((s) => { const next = new Set(s); next.delete(id); return next })
      await closeRequestNow(id)
      await refreshWorkspace()
    } catch (error) {
      setFailure(message(error, 'Não foi possível excluir o request.'))
    }
  }

  const createNewRequest = async (collectionId: number | null, folderId: number | null) => {
    try {
      const created = await createApiClientRequest(runtime, {
        collectionId,
        folderId,
        name: 'Novo request',
        request: EMPTY_REQUEST,
      })
      setDocuments((current) => ({ ...current, [created.id]: created }))
      setNewRequestIds((s) => new Set(s).add(created.id))
      setFrontCollectionId(null)
      await refreshWorkspace()
      await persistTabs(
        workspace
          ? [...workspace.viewState.openRequestIds.filter((id) => id !== created.id), created.id].slice(-12)
          : [created.id],
        created.id,
      )
    } catch (error) {
      setFailure(message(error, 'Não foi possível criar o request.'))
    }
  }

  const closeRequestNow = async (id: number) => {
    if (!workspace) return
    const current = workspace.viewState.openRequestIds
    const index = current.indexOf(id)
    const openRequestIds = current.filter((requestId) => requestId !== id)
    const activeRequestId =
      workspace.viewState.activeRequestId === id
        ? (openRequestIds[index] ?? openRequestIds[index - 1] ?? null)
        : workspace.viewState.activeRequestId
    const summary = workspace.requests.find((r) => r.id === id)
    if (summary) {
      setClosedHistory((prev) => [
        { id: summary.id, name: summary.name, method: summary.method },
        ...prev.filter((e) => e.id !== id).slice(0, 4),
      ])
    }
    try {
      await persistTabs(openRequestIds, activeRequestId)
      setDocuments((currentDocuments) => {
        const { [id]: _, ...remaining } = currentDocuments
        return remaining
      })
      setResponses((currentResponses) => {
        const { [id]: _, ...remaining } = currentResponses
        return remaining
      })
      setResponseFailures((currentFailures) => {
        const { [id]: _, ...remaining } = currentFailures
        return remaining
      })
      setDirty((currentDirty) => {
        const next = new Set(currentDirty)
        next.delete(id)
        return next
      })
    } catch (error) {
      setFailure(message(error, 'Não foi possível atualizar as abas abertas.'))
    }
  }

  const updateDraft = (next: ApiClientSavedRequest) => {
    setDocuments((current) => ({ ...current, [next.id]: next }))
    setDirty((current) => new Set(current).add(next.id))
    setPreviewRequestId((p) => (p === next.id ? null : p))
  }

  const saveRequest = async (id: number) => {
    const request = documents[id]
    if (!request) return
    setSavingId(id)
    setFailure(null)
    try {
      const saved = await updateApiClientRequest(runtime, id, withoutId(request))
      setDocuments((current) => ({ ...current, [id]: saved }))
      setDirty((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      setNewRequestIds((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
      await refreshWorkspace()
    } catch (error) {
      setFailure(message(error, 'Não foi possível salvar o request.'))
    } finally {
      setSavingId(null)
    }
  }

  const createNewCollection = async () => {
    try {
      const created = await createApiClientCollection(runtime, {
        name: 'Nova coleção',
        description: '',
      })
      setNewCollectionIds((s) => new Set(s).add(created.id))
      await refreshWorkspace()
      openCollection(created.id)
    } catch (error) {
      setFailure(message(error, 'Não foi possível criar a coleção.'))
    }
  }

  const handleReorderCollections = async (ids: number[]) => {
    try {
      await reorderApiClientCollections(runtime, ids)
      await refreshWorkspace()
    } catch (error) {
      setFailure(message(error, 'Não foi possível reordenar as coleções.'))
    }
  }

  const handleReorderFolders = async (ids: number[]) => {
    try {
      await reorderApiClientFolders(runtime, ids)
      await refreshWorkspace()
    } catch (error) {
      setFailure(message(error, 'Não foi possível reordenar as pastas.'))
    }
  }

  const handleReorderRequests = async (ids: number[]) => {
    try {
      await reorderApiClientRequests(runtime, ids)
      await refreshWorkspace()
    } catch (error) {
      setFailure(message(error, 'Não foi possível reordenar os requests.'))
    }
  }

  const handleMoveRequest = async (
    requestId: number,
    collectionId: number | null,
    folderId: number | null,
  ) => {
    try {
      const moved = await moveApiClientRequest(runtime, requestId, collectionId, folderId)
      setDocuments((current) => ({ ...current, [requestId]: moved }))
      await refreshWorkspace()
    } catch (error) {
      setFailure(message(error, 'Não foi possível mover o request.'))
    }
  }

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const id = workspace?.viewState.activeRequestId ?? null
        if (id !== null && dirty.has(id) && sendingId === null && savingId === null) {
          e.preventDefault()
          void saveRequest(id)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [workspace, dirty, sendingId, savingId, saveRequest])

  const sendRequest = async (id: number) => {
    const request = documents[id]
    if (!request) return
    setSendingId(id)
    setPreviewRequestId((p) => (p === id ? null : p))
    setFailure(null)
    try {
      const vars = request.collectionId !== null
        ? (workspace?.variables.filter((v) => v.collectionId === request.collectionId) ?? [])
        : []
      const resolved: ApiClientRequest = {
        ...request.request,
        url: resolveVariables(request.request.url, vars),
        headers: request.request.headers.map((h) => ({ ...h, value: resolveVariables(h.value, vars) })),
        body: resolveVariables(request.request.body, vars),
        authentication: {
          ...request.request.authentication,
          token: resolveVariables(request.request.authentication.token, vars),
          username: resolveVariables(request.request.authentication.username, vars),
          password: resolveVariables(request.request.authentication.password, vars),
        },
      }
      const response = await executeApiClientRequest(runtime, resolved)
      setResponses((current) => ({ ...current, [id]: response }))
      setResponseFailures((currentFailures) => {
        const { [id]: _, ...remaining } = currentFailures
        return remaining
      })
    } catch (error) {
      setResponses((current) => {
        const { [id]: _, ...remaining } = current
        return remaining
      })
      setResponseFailures((current) => ({
        ...current,
        [id]: message(error, 'Não foi possível enviar a requisição.'),
      }))
    } finally {
      setSendingId(null)
    }
  }

  const openDialog = (next: DialogState) => {
    setDialog(next)
    if (next.kind === 'rename-collection') {
      setDialogName(next.collection.name)
      setDialogDescription(next.collection.description)
      return
    }
    if (next.kind === 'rename-folder') {
      setDialogName(next.folder.name)
      setDialogDescription('')
      return
    }
    if (next.kind === 'request') {
      setDialogName(`${next.source.name} cópia`)
      setDialogDescription('')
      return
    }
    setDialogName('')
    setDialogDescription('')
  }

  const confirmDialog = async () => {
    if (!dialog) return
    setDialogBusy(true)
    setFailure(null)
    try {
      if (dialog.kind === 'folder') {
        await createApiClientFolder(runtime, {
          collectionId: dialog.collectionId,
          parentId: dialog.parentId,
          name: dialogName,
        })
        await refreshWorkspace()
      }
      if (dialog.kind === 'request') {
        const created = await createApiClientRequest(runtime, {
          collectionId: dialog.collectionId,
          folderId: dialog.folderId,
          name: dialogName,
          request: dialog.source?.request ?? EMPTY_REQUEST,
        })
        setDocuments((current) => ({ ...current, [created.id]: created }))
        await refreshWorkspace()
        await persistTabs(
          workspace
            ? [
                ...workspace.viewState.openRequestIds.filter((id) => id !== created.id),
                created.id,
              ].slice(-12)
            : [created.id],
          created.id,
        )
      }
      if (dialog.kind === 'rename-collection') {
        await updateApiClientCollection(runtime, dialog.collection.id, {
          name: dialogName,
          description: dialogDescription,
        })
        setWorkspace((w) =>
          w
            ? {
                ...w,
                collections: w.collections.map((c) =>
                  c.id === dialog.collection.id
                    ? { ...c, name: dialogName, description: dialogDescription }
                    : c,
                ),
              }
            : w,
        )
        await refreshWorkspace()
      }
      if (dialog.kind === 'rename-folder') {
        await updateApiClientFolder(runtime, dialog.folder.id, dialogName)
        await refreshWorkspace()
      }
      if (dialog.kind === 'delete-collection') {
        await deleteApiClientCollection(runtime, dialog.collection.id)
        await load()
      }
      if (dialog.kind === 'delete-folder') {
        await deleteApiClientFolder(runtime, dialog.folder.id)
        await load()
      }
      if (dialog.kind === 'delete-request') {
        await deleteApiClientRequest(runtime, dialog.request.id)
        await closeRequestNow(dialog.request.id)
        await refreshWorkspace()
      }
      if (dialog.kind === 'discard') {
        if (newRequestIds.has(dialog.requestId)) {
          await deleteApiClientRequest(runtime, dialog.requestId)
          setNewRequestIds((s) => { const next = new Set(s); next.delete(dialog.requestId); return next })
          await refreshWorkspace()
        }
        await closeRequestNow(dialog.requestId)
      }
      setDialog(null)
    } catch (error) {
      setFailure(message(error, 'Não foi possível concluir a ação.'))
    } finally {
      setDialogBusy(false)
    }
  }

  const duplicateRequest = async (summary: ApiClientRequestSummary) => {
    try {
      const source = documents[summary.id] ?? (await fetchApiClientRequest(runtime, summary.id))
      openDialog({
        kind: 'request',
        collectionId: source.collectionId ?? null,
        folderId: source.folderId,
        source,
      })
    } catch (error) {
      setFailure(message(error, 'Não foi possível duplicar o request.'))
    }
  }

  const openCollection = (id: number) => {
    const prevPreview = previewCollectionId
    setPreviewCollectionId(id)
    if (prevPreview !== null && prevPreview !== id) {
      setOpenCollectionIds((prev) => prev.filter((c) => c !== prevPreview))
      setFrontCollectionId((current) => (current === prevPreview ? null : current))
    }
    setOpenCollectionIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setFrontCollectionId(id)
  }

  const closeCollection = (id: number) => {
    if (newCollectionIds.has(id)) {
      void deleteApiClientCollection(runtime, id)
        .then(() => refreshWorkspace())
        .catch(() => {})
      setNewCollectionIds((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
    setOpenCollectionIds((prev) => prev.filter((c) => c !== id))
    setFrontCollectionId((current) => (current === id ? null : current))
    setPreviewCollectionId((p) => (p === id ? null : p))
  }

  const closeOthers = (keepRequestId: number) => {
    tabRequests.filter((r) => r.id !== keepRequestId && !dirty.has(r.id)).forEach((r) => void closeRequestNow(r.id))
    openCollectionIds.forEach((cid) => closeCollection(cid))
  }

  const closeOthersFromCollection = (keepColId: number) => {
    tabRequests.filter((r) => !dirty.has(r.id)).forEach((r) => void closeRequestNow(r.id))
    openCollectionIds.filter((cid) => cid !== keepColId).forEach((cid) => closeCollection(cid))
  }

  const closeAllTabs = () => {
    tabRequests.filter((r) => !dirty.has(r.id)).forEach((r) => void closeRequestNow(r.id))
    openCollectionIds.forEach((cid) => closeCollection(cid))
  }

  const saveCollection = async (id: number, name: string, description: string) => {
    setCollectionSaving(true)
    setFailure(null)
    try {
      await updateApiClientCollection(runtime, id, { name, description })
      setNewCollectionIds((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
      await refreshWorkspace()
    } catch (error) {
      setFailure(message(error, 'Não foi possível salvar a coleção.'))
    } finally {
      setCollectionSaving(false)
    }
  }

  const deleteCollection = async (id: number) => {
    try {
      await deleteApiClientCollection(runtime, id)
      setNewCollectionIds((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
      setOpenCollectionIds((prev) => prev.filter((c) => c !== id))
      setFrontCollectionId((current) => (current === id ? null : current))
      setPreviewCollectionId((p) => (p === id ? null : p))
      await load()
    } catch (error) {
      setFailure(message(error, 'Não foi possível excluir a coleção.'))
    }
  }

  if (loading) {
    return <LoadingWorkspace />
  }

  if (!workspace) {
    return <LoadFailure failure={failure} onRetry={() => void load()} />
  }

  const activeRequestId = workspace.viewState.activeRequestId
  const activeRequest = activeRequestId === null ? null : (documents[activeRequestId] ?? null)
  const tabRequests = workspace.viewState.openRequestIds
    .map((id) => documents[id] ?? summaryDocument(workspace, id))
    .filter((request): request is ApiClientSavedRequest => request !== null)
  const defaultCollection = workspace.collections[0]
  const activeCollection = activeRequestId !== null
    ? (workspace.collections.find((c) => c.id === documents[activeRequestId]?.collectionId) ?? null)
    : null

  return (
    <Fragment>
      <main className="animate-in min-w-0 flex-1 overflow-auto duration-200">
        <div className="mx-auto flex h-full w-full max-w-520 min-h-0 flex-col p-6">
          <header className="flex items-center justify-between gap-3">
            {activeCollection ? (
              <div className="flex min-w-0 items-center gap-2.5">
                <LuSend className="size-5 shrink-0 text-highlight" />
                <h2 className="truncate text-xl font-semibold tracking-tight">{activeCollection.name}</h2>
              </div>
            ) : (
              <div />
            )}
            <div className="flex shrink-0 items-center gap-2">
              {defaultCollection ? (
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted"
                  onClick={() => void createNewRequest(null, null)}
                >
                  <LuPlus className="size-4" />
                  Novo request
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted"
                  onClick={() => void createNewCollection()}
                >
                  <LuFolderPlus className="size-4" />
                  Criar coleção
                </button>
              )}
              <button
                type="button"
                aria-label={sidebarOpen ? 'Recolher painel de coleções' : 'Expandir painel de coleções'}
                title={sidebarOpen ? 'Recolher painel de coleções' : 'Expandir painel de coleções'}
                className="grid size-9 place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setSidebarOpen((o) => !o)}
              >
                {sidebarOpen ? <LuPanelRightClose className="size-4" /> : <LuPanelRightOpen className="size-4" />}
              </button>
            </div>
          </header>

          {failure && (
            <p
              role="alert"
              className="mt-4 shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {failure}
            </p>
          )}

          <div className="mt-6 flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-sm">
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-11 border-b" role="tablist" aria-label="Requests abertos">
                <div className="flex min-w-0 flex-1 items-center overflow-x-auto px-2">
                  {openCollectionIds.map((collId, idx) => {
                    const col = workspace.collections.find((c) => c.id === collId)
                    if (!col) return null
                    const isActive = frontCollectionId === collId
                    return (
                      <Fragment key={`col-${collId}`}>
                        {idx > 0 && <TabPipe />}
                        <div
                          className={`group flex h-11 shrink-0 items-center border-b-2 text-sm transition-colors ${isActive ? 'border-highlight text-highlight' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                          onContextMenu={(e) => openContextMenu(e, [
                            { label: 'Variáveis', icon: <LuBraces className="size-3.5" />, onClick: () => openVariableManager(collId) },
                            { separator: true },
                            { label: 'Fechar esta guia', icon: <LuX className="size-3.5" />, onClick: () => closeCollection(collId) },
                            { label: 'Fechar outras guias', icon: <LuCircleX className="size-3.5" />, disabled: openCollectionIds.length <= 1 && tabRequests.length === 0, onClick: () => closeOthersFromCollection(collId) },
                            { label: 'Fechar todas', icon: <LuCircleX className="size-3.5" />, onClick: closeAllTabs },
                          ], setContextMenu)}
                        >
                          <button type="button" role="tab" aria-selected={isActive} className="flex h-full min-w-0 items-center gap-2 px-3 text-left" onClick={() => setFrontCollectionId(collId)}>
                            <LuFolder className="size-3.5 shrink-0" />
                            <span className={`max-w-36 truncate font-medium ${previewCollectionId === collId ? 'italic' : ''}`}>{col.name}</span>
                          </button>
                          <button type="button" aria-label={`Fechar ${col.name}`} className="mr-2 grid size-5 place-items-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-muted" onClick={() => closeCollection(collId)}>
                            <LuX className="size-3.5" />
                          </button>
                        </div>
                      </Fragment>
                    )
                  })}
                  {openCollectionIds.length > 0 && tabRequests.length > 0 && <TabPipe />}
                  {tabRequests.map((request, idx) => {
                    const isActive = frontCollectionId === null && request.id === activeRequestId
                    return (
                      <Fragment key={request.id}>
                        {idx > 0 && <TabPipe />}
                        <div
                          className={`group flex h-11 shrink-0 items-center border-b-2 text-sm transition-colors ${isActive ? 'border-highlight text-highlight' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                          onContextMenu={(e) => openContextMenu(e, [
                            { label: 'Duplicar', icon: <LuCopy className="size-3.5" />, onClick: () => { const s = workspace.requests.find((r) => r.id === request.id); if (s) void duplicateRequest(s) } },
                            { separator: true },
                            { label: 'Fechar esta guia', icon: <LuX className="size-3.5" />, onClick: () => closeRequest(request.id) },
                            { label: 'Fechar outras guias', icon: <LuCircleX className="size-3.5" />, disabled: tabRequests.length <= 1 && openCollectionIds.length === 0, onClick: () => closeOthers(request.id) },
                            { label: 'Fechar todas', icon: <LuCircleX className="size-3.5" />, onClick: closeAllTabs },
                          ], setContextMenu)}
                        >
                          <button type="button" role="tab" aria-selected={isActive} className="flex h-full min-w-0 items-center gap-2 px-3 text-left" onClick={() => void openRequest(request.id)}>
                            <span className="font-mono text-[10px] font-semibold">{request.request.method}</span>
                            <span className={`max-w-36 truncate ${previewRequestId === request.id ? 'italic' : ''}`}>{request.name}</span>
                            {(dirty.has(request.id) || newRequestIds.has(request.id)) && <span aria-label="Alterações não salvas">•</span>}
                          </button>
                          <button type="button" aria-label={`Fechar ${request.name}`} className="mr-2 grid size-5 place-items-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-muted" onClick={() => closeRequest(request.id)}>
                            <LuX className="size-3.5" />
                          </button>
                        </div>
                      </Fragment>
                    )
                  })}
                  <button
                    type="button"
                    aria-label="Novo request"
                    title="Novo request"
                    className="my-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => void createNewRequest(null, null)}
                  >
                    <LuPlus className="size-4" />
                  </button>
                </div>
                <div ref={historyRef} className="relative flex shrink-0 items-center border-l px-2">
                  <button type="button" aria-label="Histórico de requests" title="Histórico de requests" className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={() => setHistoryOpen((o) => !o)}>
                    <LuHistory className="size-4" />
                  </button>
                  {historyOpen && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-lg border bg-popover shadow-md">
                      {closedHistory.length > 0 && (
                        <>
                          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fechados recentemente</div>
                          {closedHistory.map((entry) => (
                            <button key={`h-${entry.id}`} type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted" onClick={() => { void openRequest(entry.id); setHistoryOpen(false) }}>
                              <span className={`shrink-0 font-mono text-[10px] font-bold ${METHOD_COLOR[entry.method as ApiClientMethod] ?? ''}`}>{entry.method}</span>
                              <span className="min-w-0 flex-1 truncate text-left">{entry.name}</span>
                            </button>
                          ))}
                          {(tabRequests.length > 0 || openCollectionIds.length > 0) && <div className="my-1 h-px bg-border" />}
                        </>
                      )}
                      {tabRequests.length === 0 && openCollectionIds.length === 0 && closedHistory.length === 0 ? (
                        <p className="px-3 py-4 text-center text-sm text-muted-foreground">Nenhum request no histórico.</p>
                      ) : (tabRequests.length > 0 || openCollectionIds.length > 0) && (
                        <>
                          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Abertos</div>
                          {openCollectionIds.map((collId) => {
                            const col = workspace.collections.find((c) => c.id === collId)
                            if (!col) return null
                            return (
                              <button key={`hc-${collId}`} type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted" onClick={() => { setFrontCollectionId(collId); setHistoryOpen(false) }}>
                                <LuFolder className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate text-left">{col.name}</span>
                              </button>
                            )
                          })}
                          {tabRequests.map((request) => (
                            <button key={`hr-${request.id}`} type="button" className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted ${frontCollectionId === null && request.id === activeRequestId ? 'bg-muted/50' : ''}`} onClick={() => { void openRequest(request.id); setHistoryOpen(false) }}>
                              <span className={`shrink-0 font-mono text-[10px] font-bold ${METHOD_COLOR[request.request.method]}`}>{request.request.method}</span>
                              <span className="min-w-0 flex-1 truncate text-left">{request.name}</span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {frontCollectionId === null && activeRequest && (
                <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
                  <div className="flex h-10 flex-1 rounded-lg border transition-colors focus-within:ring-2 focus-within:ring-ring">
                    <MethodSelector
                      value={activeRequest.request.method}
                      disabled={!!(sendingId === activeRequest.id || savingId === activeRequest.id)}
                      onChange={(method) =>
                        updateDraft({
                          ...activeRequest,
                          request: { ...activeRequest.request, method },
                        })
                      }
                    />
                    <div className="h-5 w-px self-center bg-border" />
                    <VariableInput
                      inputMode="url"
                      value={activeRequest.request.url}
                      disabled={!!(sendingId === activeRequest.id || savingId === activeRequest.id)}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="URL"
                      className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
                      variables={activeRequest.collectionId !== null ? workspace.variables.filter((v) => v.collectionId === activeRequest.collectionId) : []}
                      onChange={(url) =>
                        updateDraft({
                          ...activeRequest,
                          request: { ...activeRequest.request, url },
                        })
                      }
                      onCreateVariable={(name) => { if (activeRequest.collectionId !== null) openVariableManager(activeRequest.collectionId, name) }}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                          e.preventDefault()
                          if (!sendingId && !savingId && activeRequest.request.url.trim())
                            void sendRequest(activeRequest.id)
                        }
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={
                      !!(sendingId === activeRequest.id || savingId === activeRequest.id) ||
                      !activeRequest.request.url.trim()
                    }
                    title="Enviar request (Ctrl + Enter)"
                    aria-keyshortcuts="Control+Enter Meta+Enter"
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                    onClick={() => void sendRequest(activeRequest.id)}
                  >
                    {sendingId === activeRequest.id && <LuLoaderCircle className="size-4 animate-spin" />}
                    Enviar
                  </button>
                </div>
              )}

              {frontCollectionId !== null ? (
                (() => {
                  const col = workspace.collections.find((c) => c.id === frontCollectionId)
                  return col ? (
                    <ApiClientCollectionEditor
                      key={col.id}
                      collection={col}
                      isNew={newCollectionIds.has(col.id)}
                      saving={collectionSaving}
                      onSave={(name, description) => void saveCollection(frontCollectionId, name, description)}
                      onDelete={() => void deleteCollection(frontCollectionId)}
                      onCancel={() => closeCollection(frontCollectionId)}
                      onInteract={() => setPreviewCollectionId(null)}
                    />
                  ) : null
                })()
              ) : activeRequest ? (
                <div className="flex min-h-0 flex-1">
                  <div className="flex min-h-0 flex-col overflow-hidden" style={{ flex: `${leftPercent} 1 0` }}>
                    <ApiClientRequestForm
                      draft={activeRequest}
                      dirty={dirty.has(activeRequest.id)}
                      saving={savingId === activeRequest.id}
                      sending={sendingId === activeRequest.id}
                      onChange={updateDraft}
                      onSave={() => void saveRequest(activeRequest.id)}
                      onSend={() => void sendRequest(activeRequest.id)}
                      variables={activeRequest.collectionId !== null ? workspace.variables.filter((v) => v.collectionId === activeRequest.collectionId) : []}
                      onCreateVariable={(name) => { if (activeRequest.collectionId !== null) openVariableManager(activeRequest.collectionId, name) }}
                    />
                  </div>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Ajustar largura dos painéis (duplo clique para 50/50)"
                    className="group relative flex h-full w-3 shrink-0 cursor-col-resize touch-none select-none items-center justify-center"
                    onPointerDown={(e: PointerEvent<HTMLDivElement>) => e.currentTarget.setPointerCapture(e.pointerId)}
                    onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
                      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
                      const { left, width } = e.currentTarget.parentElement!.getBoundingClientRect()
                      setLeftPercent(clampSplit(((e.clientX - left) / width) * 100))
                    }}
                    onPointerUp={(e: PointerEvent<HTMLDivElement>) => {
                      const { left, width } = e.currentTarget.parentElement!.getBoundingClientRect()
                      const p = clampSplit(((e.clientX - left) / width) * 100)
                      setLeftPercent(p)
                      saveSplit(p)
                    }}
                    onDoubleClick={() => { setLeftPercent(50); saveSplit(50) }}
                  >
                    <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
                    <span className="relative z-10 flex items-center rounded-sm bg-card px-px">
                      <LuGripVertical className="size-3.5 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
                    </span>
                  </div>
                  <div className="min-h-0 overflow-auto" style={{ flex: `${100 - leftPercent} 1 0` }}>
                    <ApiClientResponsePanel
                      embedded
                      response={responses[activeRequest.id] ?? null}
                      failure={responseFailures[activeRequest.id] ?? null}
                      sending={sendingId === activeRequest.id}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid flex-1 place-items-center p-6">
                  <LuMousePointerClick
                    className="size-20 text-muted-foreground/40"
                    strokeWidth={1.25}
                    aria-label="Selecione um request"
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
      {sidebarOpen && (
        <>
          <div
            className="group relative flex h-full w-3 shrink-0 cursor-col-resize touch-none select-none items-center justify-center"
            onPointerDown={(e: PointerEvent<HTMLDivElement>) => e.currentTarget.setPointerCapture(e.pointerId)}
            onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
              const parent = e.currentTarget.parentElement
              if (!parent) return
              const rect = parent.getBoundingClientRect()
              const rawWidth = Math.round(rect.right - e.clientX)
              setSidebarWidth(Math.max(MIN_SIDEBAR, Math.min(Math.floor(rect.width / 2), rawWidth)))
            }}
            onPointerUp={(e: PointerEvent<HTMLDivElement>) => {
              const parent = e.currentTarget.parentElement
              if (!parent) return
              const rect = parent.getBoundingClientRect()
              const rawWidth = Math.round(rect.right - e.clientX)
              const w = Math.max(MIN_SIDEBAR, Math.min(Math.floor(rect.width / 2), rawWidth))
              setSidebarWidth(w)
              saveSidebarWidth(w)
            }}
            onDoubleClick={() => { setSidebarWidth(DEFAULT_SIDEBAR); saveSidebarWidth(DEFAULT_SIDEBAR) }}
          >
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
            <span className="relative z-10 flex items-center rounded-sm bg-card px-px">
              <LuGripVertical className="size-3.5 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
            </span>
          </div>
          <aside className="shrink-0 overflow-auto p-6" style={{ width: sidebarWidth }}>
            <ApiClientCollectionTree
              collections={workspace.collections}
              folders={workspace.folders}
              requests={workspace.requests}
              activeRequestId={activeRequestId}
              onCreateCollection={() => void createNewCollection()}
              onCreateFolder={(collectionId, parentId) =>
                openDialog({ kind: 'folder', collectionId, parentId })
              }
              onCreateRequest={(collectionId, folderId) => void createNewRequest(collectionId, folderId)}
              onOpenRequest={(id) => void openRequest(id)}
              onRenameCollection={(collection) => openDialog({ kind: 'rename-collection', collection })}
              onRenameFolder={(folder) => openDialog({ kind: 'rename-folder', folder })}
              onDeleteCollection={(collection) => openDialog({ kind: 'delete-collection', collection })}
              onDeleteFolder={(folder) => openDialog({ kind: 'delete-folder', folder })}
              onDuplicateRequest={(request) => void duplicateRequest(request)}
              onDeleteRequest={(request) => openDialog({ kind: 'delete-request', request })}
              onOpenCollection={(collection) => openCollection(collection.id)}
              onOpenVariables={(collection) => openVariableManager(collection.id)}
              onReorderCollections={(ids) => void handleReorderCollections(ids)}
              onReorderFolders={(ids) => void handleReorderFolders(ids)}
              onReorderRequests={(ids) => void handleReorderRequests(ids)}
              onMoveRequest={(requestId, collectionId, folderId) =>
                void handleMoveRequest(requestId, collectionId, folderId)
              }
            />
          </aside>
        </>
      )}
      {contextMenu !== null && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
      {dialog && (
        <WorkspaceDialog
          state={dialog}
          name={dialogName}
          description={dialogDescription}
          busy={dialogBusy}
          onNameChange={setDialogName}
          onDescriptionChange={setDialogDescription}
          onCancel={() => setDialog(null)}
          onConfirm={() => void confirmDialog()}
        />
      )}
      {variableManagerCollection && (
        <VariableManager
          collectionId={variableManagerCollection.id}
          collectionName={variableManagerCollection.name}
          variables={workspace.variables.filter((v) => v.collectionId === variableManagerCollection.id)}
          runtime={runtime}
          initialNew={variableManagerCollection.initialName}
          onClose={() => setVariableManagerCollection(null)}
          onChange={(vars) => handleVariablesChange(variableManagerCollection.id, vars)}
        />
      )}
    </Fragment>
  )
}

function ApiClientCollectionEditor({
  collection,
  isNew = false,
  saving,
  onSave,
  onDelete,
  onCancel,
  onInteract,
}: {
  collection: ApiClientCollection
  isNew?: boolean
  saving: boolean
  onSave: (name: string, description: string) => void
  onDelete: () => void
  onCancel: () => void
  onInteract?: () => void
}) {
  const initialName = isNew ? '' : collection.name
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(collection.description)
  const dirty = isNew
    ? name.trim().length > 0
    : name !== collection.name || description !== collection.description

  return (
    <div className="animate-in fade-in flex min-h-0 flex-1 flex-col overflow-auto p-6 duration-200">
      <div className="max-w-lg space-y-4">
        <label className="block text-sm font-medium">
          Nome
          <input
            value={name}
            disabled={saving}
            autoComplete="off"
            autoFocus={isNew}
            placeholder={isNew ? 'Nome da coleção' : undefined}
            className="field-input mt-2 w-full font-normal"
            onChange={(e) => { setName(e.target.value); onInteract?.() }}
          />
        </label>
        <label className="block text-sm font-medium">
          Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
          <textarea
            value={description}
            disabled={saving}
            maxLength={500}
            className="mt-2 min-h-24 w-full resize-y rounded-lg border bg-card p-3 text-sm font-normal outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(e) => { setDescription(e.target.value); onInteract?.() }}
          />
        </label>
      </div>
      <div className="mt-6 flex items-center gap-3">
        {isNew ? (
          <>
            <button
              type="button"
              disabled={!dirty || saving}
              className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              onClick={() => onSave(name.trim(), description)}
            >
              {saving && <LuLoaderCircle className="size-4 animate-spin" />}
              Criar
            </button>
            <button
              type="button"
              disabled={saving}
              className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              onClick={onCancel}
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={!dirty || saving}
              className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              onClick={() => onSave(name, description)}
            >
              {saving && <LuLoaderCircle className="size-4 animate-spin" />}
              Salvar
            </button>
            <button
              type="button"
              disabled={saving}
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/40 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-40"
              onClick={onDelete}
            >
              <LuTrash2 className="size-4" />
              Excluir
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function WorkspaceDialog({
  state,
  name,
  description,
  busy,
  onNameChange,
  onDescriptionChange,
  onCancel,
  onConfirm,
}: {
  state: DialogState
  name: string
  description: string
  busy: boolean
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const copy = dialogCopy(state)
  const hasFields =
    state.kind !== 'delete-collection' &&
    state.kind !== 'delete-folder' &&
    state.kind !== 'delete-request' &&
    state.kind !== 'discard'
  const collectionFields = state.kind === 'rename-collection'

  return (
    <ApiClientDialog
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      destructive={copy.destructive}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      {hasFields && (
        <div className="space-y-4">
          <label className="block text-sm font-medium" htmlFor="api-workspace-dialog-name">
            Nome
            <input
              id="api-workspace-dialog-name"
              data-dialog-initial-focus
              value={name}
              disabled={busy}
              autoComplete="off"
              className="field-input mt-2 font-normal"
              onChange={(event) => onNameChange(event.target.value)}
            />
          </label>
          {collectionFields && (
            <label className="block text-sm font-medium" htmlFor="api-workspace-dialog-description">
              Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
              <textarea
                id="api-workspace-dialog-description"
                value={description}
                disabled={busy}
                maxLength={500}
                className="mt-2 min-h-24 w-full resize-y rounded-lg border bg-card p-3 text-sm font-normal outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => onDescriptionChange(event.target.value)}
              />
            </label>
          )}
        </div>
      )}
    </ApiClientDialog>
  )
}

function dialogCopy(state: DialogState) {
  if (state.kind === 'folder') {
    return {
      title: 'Nova pasta',
      description: 'Organize requests dentro da coleção selecionada.',
      confirmLabel: 'Criar',
      destructive: false,
    }
  }
  if (state.kind === 'request') {
    return {
      title: 'Duplicar request',
      description: 'O request duplicado será salvo na localização selecionada.',
      confirmLabel: 'Duplicar',
      destructive: false,
    }
  }
  if (state.kind === 'rename-collection' || state.kind === 'rename-folder') {
    return {
      title: 'Renomear',
      description: 'Atualize o nome usado no workspace.',
      confirmLabel: 'Salvar',
      destructive: false,
    }
  }
  if (state.kind === 'delete-collection') {
    return {
      title: 'Excluir coleção',
      description: `“${state.collection.name}” e todos os seus requests serão removidos.`,
      confirmLabel: 'Excluir',
      destructive: true,
    }
  }
  if (state.kind === 'delete-folder') {
    return {
      title: 'Excluir pasta',
      description: `“${state.folder.name}” e suas subpastas serão removidas. Os requests voltam para a raiz da coleção.`,
      confirmLabel: 'Excluir',
      destructive: true,
    }
  }
  if (state.kind === 'delete-request') {
    return {
      title: 'Excluir request',
      description: `“${state.request.name}” será removido da coleção local.`,
      confirmLabel: 'Excluir',
      destructive: true,
    }
  }
  return {
    title: state.kind === 'discard' ? 'Descartar alterações' : 'Descartar',
    description: 'As alterações não salvas deste request serão perdidas.',
    confirmLabel: 'Descartar',
    destructive: true,
  }
}

function EmptyWorkbench({
  collection,
  onCreateCollection,
  onCreateRequest,
}: {
  collection: ApiClientCollection | undefined
  onCreateCollection: () => void
  onCreateRequest: () => void
}) {
  return (
    <div className="grid min-h-96 flex-1 place-items-center gap-4 p-8 text-center">
      <div>
        <LuFilePlus2 className="mx-auto size-8 text-highlight" />
        <h3 className="mt-4 text-base font-semibold">
          {collection ? 'Abra ou crie um request' : 'Crie sua primeira coleção'}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {collection
            ? 'Use a árvore de coleções para organizar endpoints e manter o contexto do projeto.'
            : 'Coleções agrupam endpoints, pastas e credenciais locais do mesmo projeto.'}
        </p>
        <button
          type="button"
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={collection ? () => onCreateRequest() : onCreateCollection}
        >
          {collection ? <LuPlus className="size-4" /> : <LuFolderPlus className="size-4" />}
          {collection ? 'Novo request' : 'Nova coleção'}
        </button>
      </div>
    </div>
  )
}

function LoadingWorkspace() {
  return (
    <div
      className="grid h-full min-h-72 place-items-center gap-3 p-6 text-sm text-muted-foreground"
      role="status"
    >
      <LuLoaderCircle className="size-5 animate-spin" />
      Carregando workspace de API…
    </div>
  )
}

function LoadFailure({ failure, onRetry }: { failure: string | null; onRetry: () => void }) {
  return (
    <div className="grid h-full min-h-72 place-items-center gap-3 p-6 text-center">
      <p className="text-sm text-destructive">
        {failure ?? 'Não foi possível carregar o workspace de API.'}
      </p>
      <button
        type="button"
        className="h-9 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
        onClick={onRetry}
      >
        Tentar novamente
      </button>
    </div>
  )
}

function summaryDocument(workspace: ApiClientWorkspace, id: number): ApiClientSavedRequest | null {
  const summary = workspace.requests.find((request) => request.id === id)
  if (!summary) return null
  return {
    id: summary.id,
    collectionId: summary.collectionId,
    folderId: summary.folderId,
    name: summary.name,
    request: { ...EMPTY_REQUEST, method: summary.method },
  }
}

function withoutId(request: ApiClientSavedRequest) {
  const { id: _, ...draft } = request
  return draft
}

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
