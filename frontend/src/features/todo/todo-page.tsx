import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Fragment, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import type React from 'react'
import {
  LuCalendar,
  LuCheck,
  LuChevronDown,
  LuCircleDot,
  LuClipboardList,
  LuGripVertical,
  LuKanban,
  LuList,
  LuLoaderCircle,
  LuLock,
  LuMousePointerClick,
  LuPanelRightClose,
  LuPanelRightOpen,
  LuPencil,
  LuPlus,
  LuSearch,
  LuTrash2,
} from 'react-icons/lu'
import {
  assignTodoPageLabels,
  createTodoLabel,
  createTodoList,
  createTodoPage,
  createTodoProject,
  deleteTodoLabel,
  deleteTodoList,
  deleteTodoPage,
  deleteTodoProject,
  fetchTodoLabels,
  fetchTodoLists,
  fetchTodoPages,
  fetchTodoProjects,
  reorderTodoLists,
  reorderTodoPages,
  updateTodoLabel,
  updateTodoList,
  updateTodoPage,
  updateTodoProject,
  type RuntimeStatus,
  type TodoLabel,
  type TodoList,
  type TodoPage,
  type TodoProject,
} from '../../api'
import { useModalDialog } from '../accessibility/use-modal-dialog'
import { ContextMenu, openContextMenu, type ContextMenuState } from '../api-client/context-menu'
import { IconDisplay } from '../../shared/icon-picker/icon-display'
import { IconPicker } from '../../shared/icon-picker/icon-picker'
import { DEFAULT_ICON_VALUE } from '../../shared/icon-picker/icon-data'

// ─── persistence ──────────────────────────────────────────────────────────────

const SIDEBAR_RATIO_KEY = 'todo-sidebar-ratio'
const SIDEBAR_OPEN_KEY = 'todo-sidebar-open'
const ACTIVE_PROJECT_KEY = 'todo-active-project'
const VIEW_KEY = 'todo-view'
const DEFAULT_RATIO = 0.25
const MIN_RATIO = 0.15
const MAX_RATIO = 0.5
const MIN_SIDEBAR = 180

function ratioToWidth(ratio: number, containerWidth = window.innerWidth) {
  return Math.max(MIN_SIDEBAR, Math.round(containerWidth * ratio))
}
function widthToRatio(px: number, containerWidth: number) {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, px / containerWidth))
}

function loadNum(key: string, def: number) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? def : Number(v)
  } catch {
    return def
  }
}
function loadBool(key: string, def: boolean) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? def : v === 'true'
  } catch {
    return def
  }
}
function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, String(value))
  } catch {}
}

// ─── types ────────────────────────────────────────────────────────────────────

type View = 'kanban' | 'list' | 'info'

type DialogState =
  | { kind: 'create-project' }
  | { kind: 'edit-project'; project: TodoProject }
  | { kind: 'delete-project'; project: TodoProject }
  | { kind: 'create-list' }
  | { kind: 'edit-list'; list: TodoList; label: TodoLabel }
  | { kind: 'delete-list'; list: TodoList }
  | { kind: 'delete-page'; page: TodoPage }

type PageDialog = { page: TodoPage | null; projectId: number; defaultLabelId: number | null }

type DraftLabel = { tempId: string; id?: number; name: string; color: string }
function labelsTooDraft(ls: TodoLabel[]): DraftLabel[] {
  return ls.filter((l) => !l.system).map((l) => ({ tempId: `l${l.id}`, id: l.id, name: l.name, color: l.color }))
}

// ─── component ────────────────────────────────────────────────────────────────

export function TodoPage({ runtime }: { runtime: RuntimeStatus }) {
  const [projects, setProjects] = useState<TodoProject[]>([])
  const [labels, setLabels] = useState<TodoLabel[]>([])
  const [lists, setLists] = useState<TodoList[]>([])
  const [pages, setPages] = useState<TodoPage[]>([])
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null)
  const [view, setView] = useState<View>(() =>
    localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'kanban',
  )
  const [sidebarOpen, setSidebarOpen] = useState(() => loadBool(SIDEBAR_OPEN_KEY, true))
  const sidebarRatioRef = useRef(loadNum(SIDEBAR_RATIO_KEY, DEFAULT_RATIO))
  const [sidebarWidth, setSidebarWidth] = useState(() => ratioToWidth(sidebarRatioRef.current))
  const dragRef = useRef<{ startX: number; active: boolean } | null>(null)

  useEffect(() => {
    const onResize = () => setSidebarWidth(ratioToWidth(sidebarRatioRef.current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [projSearch, setProjSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [pagesLoading, setPagesLoading] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [pageDialog, setPageDialog] = useState<PageDialog | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [activeDragId, setActiveDragId] = useState<UniqueIdentifier | null>(null)
  const [activeDragType, setActiveDragType] = useState<'page' | 'list' | null>(null)

  // form fields
  const [projIcon, setProjIcon] = useState('')
  const [projName, setProjName] = useState('')
  const [projDesc, setProjDesc] = useState('')
  const [selectedLabelId, setSelectedLabelId] = useState<number | null>(null)
  const [listDesc, setListDesc] = useState('')

  const loadProjects = useCallback(async () => {
    setLoading(true)
    setFailure(null)
    try {
      const list = await fetchTodoProjects(runtime)
      setProjects(list)
      return list
    } catch {
      setFailure('Não foi possível carregar os projetos.')
      return null
    } finally {
      setLoading(false)
    }
  }, [runtime])

  const loadProjectData = useCallback(
    async (projectId: number) => {
      setPagesLoading(true)
      try {
        const [lbls, lsts, pgs] = await Promise.all([
          fetchTodoLabels(runtime, projectId),
          fetchTodoLists(runtime, projectId),
          fetchTodoPages(runtime, projectId),
        ])
        setLabels(lbls)
        setLists(lsts)
        setPages(pgs)
      } catch {
        setFailure('Não foi possível carregar o projeto.')
      } finally {
        setPagesLoading(false)
      }
    },
    [runtime],
  )

  useEffect(() => {
    void loadProjects().then((list) => {
      if (!list) return
      const saved = loadNum(ACTIVE_PROJECT_KEY, 0) || null
      const id = saved && list.find((p) => p.id === saved) ? saved : (list[0]?.id ?? null)
      setActiveProjectId(id)
      if (id) void loadProjectData(id)
    })
  }, [runtime, loadProjects, loadProjectData])

  const switchProject = (id: number) => {
    setActiveProjectId(id)
    persist(ACTIVE_PROJECT_KEY, id)
    void loadProjectData(id)
  }

  const toggleSidebar = () =>
    setSidebarOpen((o) => {
      persist(SIDEBAR_OPEN_KEY, !o)
      return !o
    })

  const setViewMode = (v: View) => {
    setView(v)
    if (v !== 'info') persist(VIEW_KEY, v)
  }

  const saveInfoView = async (icon: string, name: string, desc: string, draft: DraftLabel[]) => {
    if (!activeProject) return
    setBusy(true); setFailure(null)
    try {
      const updated = await updateTodoProject(runtime, activeProject.id, { icon, name, description: desc })
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))

      let current = [...labels]

      const toDelete = labels.filter((o) => !o.system && !draft.some((d) => d.id === o.id))
      for (const l of toDelete) {
        await deleteTodoLabel(runtime, l.id)
        current = current.filter((c) => c.id !== l.id)
      }

      for (const d of draft.filter((d) => !d.id)) {
        const created = await createTodoLabel(runtime, activeProject.id, { name: d.name, color: d.color })
        current.push(created)
      }

      for (const d of draft.filter((d) => d.id)) {
        const orig = labels.find((o) => o.id === d.id)
        if (orig && (orig.name !== d.name || orig.color !== d.color)) {
          const up = await updateTodoLabel(runtime, d.id!, { name: d.name, color: d.color })
          current = current.map((c) => (c.id === d.id ? up : c))
        }
      }

      setLabels(current)
      if (toDelete.length > 0) {
        const deletedIds = new Set(toDelete.map((l) => l.id))
        setPages((prev) => prev.map((p) => ({ ...p, labelIds: p.labelIds.filter((id) => !deletedIds.has(id)) })))
        setLists((prev) => prev.filter((lst) => !deletedIds.has(lst.labelId)))
      }
    } catch {
      setFailure('Não foi possível salvar as informações.')
    } finally {
      setBusy(false)
    }
  }

  // ── project CRUD ───────────────────────────────────────────────────────────

  const openProjectDialog = (d: DialogState) => {
    if (d.kind === 'create-project') { setProjIcon('@notebook:#f59e0b'); setProjName(''); setProjDesc('') }
    else if (d.kind === 'edit-project') { setProjIcon(d.project.icon); setProjName(d.project.name); setProjDesc(d.project.description) }
    setDialog(d)
  }

  const confirmProjectDialog = async () => {
    if (!dialog) return
    setBusy(true); setFailure(null)
    try {
      if (dialog.kind === 'create-project') {
        const created = await createTodoProject(runtime, { icon: projIcon || '📁', name: projName, description: projDesc })
        setProjects((prev) => [...prev, created])
        const newLists = await fetchTodoLists(runtime, created.id)
        const firstList = newLists[0]
        await createTodoPage(runtime, created.id, {
          icon: '@file-text:#f59e0b',
          title: 'Nova página',
          content: '',
          labelIds: firstList ? [firstList.labelId] : [],
          dueDate: null,
        })
        switchProject(created.id)
      } else if (dialog.kind === 'edit-project') {
        const updated = await updateTodoProject(runtime, dialog.project.id, { icon: projIcon || '📁', name: projName, description: projDesc })
        setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      } else if (dialog.kind === 'delete-project') {
        await deleteTodoProject(runtime, dialog.project.id)
        setProjects((prev) => prev.filter((p) => p.id !== dialog.project.id))
        if (activeProjectId === dialog.project.id) {
          setActiveProjectId(null); persist(ACTIVE_PROJECT_KEY, 0)
          setLabels([]); setLists([]); setPages([])
        }
      }
      setDialog(null)
    } catch {
      setFailure('Não foi possível concluir a ação.')
    } finally {
      setBusy(false)
    }
  }

  // ── list CRUD ──────────────────────────────────────────────────────────────

  const openListDialog = (d?: { kind: 'edit-list'; list: TodoList; label: TodoLabel }) => {
    if (d) {
      setSelectedLabelId(d.label.id); setListDesc(d.list.description)
      setDialog(d)
    } else {
      setSelectedLabelId(null); setListDesc('')
      setDialog({ kind: 'create-list' })
    }
  }

  const confirmListDialog = async () => {
    if (!dialog || !activeProjectId || selectedLabelId === null) return
    setBusy(true); setFailure(null)
    try {
      if (dialog.kind === 'create-list') {
        const { list: newList, label: newLabel } = await createTodoList(runtime, activeProjectId, { labelId: selectedLabelId, description: listDesc })
        setLists((prev) => [...prev, newList])
        setLabels((prev) => prev.map((l) => (l.id === newLabel.id ? newLabel : l)))
      } else if (dialog.kind === 'edit-list') {
        const { list: updatedList, label: updatedLabel } = await updateTodoList(runtime, dialog.list.id, { labelId: selectedLabelId, description: listDesc })
        setLists((prev) => prev.map((l) => (l.id === updatedList.id ? updatedList : l)))
        setLabels((prev) => prev.map((l) => (l.id === updatedLabel.id ? updatedLabel : l)))
      } else if (dialog.kind === 'delete-list') {
        await deleteTodoList(runtime, dialog.list.id)
        setLists((prev) => prev.filter((l) => l.id !== dialog.list.id))
      }
      setDialog(null)
    } catch {
      setFailure('Não foi possível concluir a ação.')
    } finally {
      setBusy(false)
    }
  }

  // ── page CRUD ──────────────────────────────────────────────────────────────

  const openPageDialog = (page: TodoPage | null, defaultLabelId: number | null = null) => {
    if (!activeProjectId) return
    setPageDialog({ page, projectId: activeProjectId, defaultLabelId })
  }

  const savePageDialog = async (data: { icon: string; title: string; content: string; labelIds: number[]; dueDate: string }) => {
    if (!pageDialog) return
    setBusy(true); setFailure(null)
    try {
      const payload = { ...data, dueDate: data.dueDate || null }
      if (pageDialog.page) {
        const updated = await updateTodoPage(runtime, pageDialog.page.id, payload)
        setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      } else {
        const created = await createTodoPage(runtime, pageDialog.projectId, payload)
        setPages((prev) => [created, ...prev])
      }
      setPageDialog(null)
    } catch {
      setFailure('Não foi possível salvar a página.')
    } finally {
      setBusy(false)
    }
  }

  const confirmDeletePage = async () => {
    if (!dialog || dialog.kind !== 'delete-page') return
    setBusy(true); setFailure(null)
    try {
      await deleteTodoPage(runtime, dialog.page.id)
      setPages((prev) => prev.filter((p) => p.id !== dialog.page.id))
      setDialog(null); setPageDialog(null)
    } catch {
      setFailure('Não foi possível excluir a página.')
    } finally {
      setBusy(false)
    }
  }

  // ── drag & drop ────────────────────────────────────────────────────────────

  const activeDragPage = activeDragType === 'page' && activeDragId ? (pages.find((p) => p.id === activeDragId) ?? null) : null
  const activeDragList = activeDragType === 'list' && activeDragId ? (lists.find((l) => `list-${l.id}` === String(activeDragId)) ?? null) : null
  const activeDragListLabel = activeDragList ? (labels.find((l) => l.id === activeDragList.labelId) ?? null) : null
  const activeDragListPageCount = activeDragList ? pages.filter((p) => p.labelIds.includes(activeDragList.labelId)).length : 0

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveDragId(active.id)
    setActiveDragType((active.data.current as { type?: string } | undefined)?.type === 'list' ? 'list' : 'page')
  }

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || active.id === over.id) return
    if ((active.data.current as { type?: string } | undefined)?.type === 'list') return
    const srcListId = (active.data.current as { listId?: number } | undefined)?.listId ?? null
    const dstListId =
      typeof over.id === 'string' && over.id.startsWith('col-')
        ? Number(over.id.slice(4))
        : (over.data.current as { listId?: number } | undefined)?.listId ?? null
    if (srcListId === null || dstListId === null || srcListId === dstListId) return
    const srcList = lists.find((l) => l.id === srcListId)
    const dstList = lists.find((l) => l.id === dstListId)
    if (!srcList || !dstList) return
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== active.id) return p
        const newIds = p.labelIds.filter((id) => id !== srcList.labelId)
        if (!newIds.includes(dstList.labelId)) newIds.push(dstList.labelId)
        return { ...p, labelIds: newIds }
      }),
    )
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null)
    setActiveDragType(null)
    if (!over || active.id === over.id) return

    if ((active.data.current as { type?: string } | undefined)?.type === 'list') {
      const activeListId = (active.data.current as { listId?: number } | undefined)?.listId
      const overListId = (over.data.current as { listId?: number } | undefined)?.listId
      if (!activeListId || !overListId || !activeProjectId) return
      const sorted = [...lists].sort((a, b) => a.sortOrder - b.sortOrder)
      const oldIdx = sorted.findIndex((l) => l.id === activeListId)
      const newIdx = sorted.findIndex((l) => l.id === overListId)
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return
      const reordered = arrayMove(sorted, oldIdx, newIdx)
      const ids = reordered.map((l) => l.id)
      setLists(reordered.map((l, i) => ({ ...l, sortOrder: i })))
      void reorderTodoLists(runtime, activeProjectId, ids).catch(() => setFailure('Não foi possível reordenar as listas.'))
      return
    }

    const srcListId = (active.data.current as { listId?: number } | undefined)?.listId ?? null
    const dstListId =
      typeof over.id === 'string' && over.id.startsWith('col-')
        ? Number(over.id.slice(4))
        : (over.data.current as { listId?: number } | undefined)?.listId ?? null
    const movedPage = pages.find((p) => p.id === active.id)
    if (!movedPage) return

    if (dstListId !== null && srcListId !== dstListId) {
      void assignTodoPageLabels(runtime, movedPage.id, movedPage.labelIds).catch(() =>
        setFailure('Não foi possível mover a página.'),
      )
    } else {
      const listId = srcListId
      if (listId === null) return
      const list = lists.find((l) => l.id === listId)
      if (!list) return
      const colPages = pages
        .filter((p) => p.labelIds.includes(list.labelId))
        .sort((a, b) => a.sortOrder - b.sortOrder)
      const oldIdx = colPages.findIndex((p) => p.id === active.id)
      const newIdx = colPages.findIndex((p) => p.id === over.id)
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return
      const reordered = arrayMove(colPages, oldIdx, newIdx)
      const sortedIds = reordered.map((p) => p.id)
      setPages((prev) => {
        const orderMap = new Map(sortedIds.map((id, i) => [id, i]))
        return prev.map((p) => (orderMap.has(p.id) ? { ...p, sortOrder: orderMap.get(p.id)! } : p))
      })
      void reorderTodoPages(runtime, sortedIds).catch(() => setFailure('Não foi possível reordenar.'))
    }
  }

  const createLabelForList = async (name: string, color: string): Promise<TodoLabel | null> => {
    if (!activeProjectId) return null
    try {
      const created = await createTodoLabel(runtime, activeProjectId, { name, color })
      setLabels((prev) => [...prev, created])
      return created
    } catch {
      setFailure('Não foi possível criar a label.')
      return null
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  if (loading) {
    return (
      <div className="grid h-full place-items-center" role="status">
        <LuLoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Fragment>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeProject && (
          <header className="flex shrink-0 items-center gap-3 border-b px-6 py-3.5">
            <button type="button" title="Informações do projeto"
              className="flex min-w-0 items-center gap-2.5"
              onClick={() => setViewMode(view === 'info' ? (localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'kanban') : 'info')}>
              <IconDisplay value={activeProject.icon} className="shrink-0 text-lg" />
              <h2 className="min-w-0 truncate text-base font-semibold tracking-tight">{activeProject.name}</h2>
            </button>
            <div className="flex-1" />
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex h-8 items-center rounded-lg border bg-card p-0.5">
                <button type="button" title="Kanban" aria-pressed={view === 'kanban'}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 transition-colors ${view === 'kanban' ? 'bg-muted text-foreground' : 'size-7 justify-center text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setViewMode('kanban')}>
                  <LuKanban className="size-3.5 shrink-0" />
                  {view === 'kanban' && <span className="text-xs font-medium">Kanban</span>}
                </button>
                <button type="button" title="Lista" aria-pressed={view === 'list'}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 transition-colors ${view === 'list' ? 'bg-muted text-foreground' : 'size-7 justify-center text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setViewMode('list')}>
                  <LuList className="size-3.5 shrink-0" />
                  {view === 'list' && <span className="text-xs font-medium">Lista</span>}
                </button>
              </div>
              <button type="button"
                aria-label={sidebarOpen ? 'Recolher projetos' : 'Expandir projetos'}
                className="grid size-8 place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={toggleSidebar}>
                {sidebarOpen ? <LuPanelRightClose className="size-4" /> : <LuPanelRightOpen className="size-4" />}
              </button>
            </div>
          </header>
        )}


        {!activeProject ? (
          <NoProjectState />
        ) : view === 'info' ? (
          <InfoView project={activeProject} labels={labels} busy={busy}
            onSave={saveInfoView}
            onDeleteProject={() => openProjectDialog({ kind: 'delete-project', project: activeProject })} />
        ) : pagesLoading ? (
          <div className="grid flex-1 place-items-center" role="status">
            <LuLoaderCircle className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            {view === 'kanban' ? (
              <KanbanBoard lists={lists} labels={labels} pages={pages} onOpenPage={openPageDialog}
                onNewPage={(list) => openPageDialog(null, list.labelId)} onCreateList={() => openListDialog()}
                onEditList={(list, label) => openListDialog({ kind: 'edit-list', list, label })} />
            ) : (
              <ListView labels={labels} pages={pages} onOpenPage={openPageDialog} />
            )}
            <DragOverlay>
              {activeDragPage && <PageCardOverlay page={activeDragPage} labels={labels} />}
              {activeDragList && activeDragListLabel && (
                <KanbanColumnOverlay label={activeDragListLabel} pageCount={activeDragListPageCount} />
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {sidebarOpen && (
        <>
          <div role="separator" aria-orientation="vertical"
            className="group relative flex h-full w-3 shrink-0 cursor-col-resize touch-none select-none items-center justify-center"
            onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              dragRef.current = { startX: e.clientX, active: false }
            }}
            onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId) || !dragRef.current) return
              if (!dragRef.current.active) {
                if (Math.abs(e.clientX - dragRef.current.startX) < 4) return
                dragRef.current.active = true
              }
              const parent = e.currentTarget.parentElement
              if (!parent) return
              const rect = parent.getBoundingClientRect()
              setSidebarWidth(Math.max(MIN_SIDEBAR, Math.min(Math.floor(rect.width * MAX_RATIO), Math.round(rect.right - e.clientX))))
            }}
            onPointerUp={(e: PointerEvent<HTMLDivElement>) => {
              if (!dragRef.current?.active) { dragRef.current = null; return }
              const parent = e.currentTarget.parentElement
              if (!parent) { dragRef.current = null; return }
              const rect = parent.getBoundingClientRect()
              const w = Math.max(MIN_SIDEBAR, Math.min(Math.floor(rect.width * MAX_RATIO), Math.round(rect.right - e.clientX)))
              const ratio = widthToRatio(w, rect.width)
              sidebarRatioRef.current = ratio
              setSidebarWidth(w); persist(SIDEBAR_RATIO_KEY, ratio)
              dragRef.current = null
            }}
            onDoubleClick={() => {
              sidebarRatioRef.current = DEFAULT_RATIO
              setSidebarWidth(ratioToWidth(DEFAULT_RATIO))
              persist(SIDEBAR_RATIO_KEY, DEFAULT_RATIO)
            }}>
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
            <span className="relative z-10 flex items-center rounded-sm bg-card px-px">
              <LuGripVertical className="size-3.5 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
            </span>
          </div>

          <aside className="flex shrink-0 flex-col" style={{ width: sidebarWidth }}>
            <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">Projetos</h2>
                <button type="button" title="Novo projeto" aria-label="Novo projeto"
                  className="grid size-7 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => openProjectDialog({ kind: 'create-project' })}>
                  <LuPlus className="size-3.5" />
                </button>
              </div>
              <label className="relative block">
                <span className="sr-only">Buscar projetos</span>
                <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={projSearch}
                  autoComplete="off"
                  placeholder="Buscar projetos"
                  className="h-9 w-full rounded-lg border bg-card pr-3 pl-9 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(e) => setProjSearch(e.target.value)}
                />
              </label>
            </div>
            {projects.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <LuClipboardList className="size-12 text-muted-foreground/25" strokeWidth={1.25} />
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Nenhum projeto ainda</p>
                  <p className="text-xs text-muted-foreground">
                    Crie projetos, organize suas atividades e acompanhe tudo em um só lugar com o{' '}
                    <span className="font-medium text-highlight">Godard</span>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {projects.filter((p) => !projSearch.trim() || p.name.toLowerCase().includes(projSearch.toLowerCase())).map((project) => (
                  <button key={project.id} type="button"
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted ${activeProjectId === project.id ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => {
                      if (activeProjectId === project.id) {
                        setActiveProjectId(null); persist(ACTIVE_PROJECT_KEY, 0)
                        setLabels([]); setLists([]); setPages([])
                      } else {
                        switchProject(project.id)
                      }
                    }}
                    onContextMenu={(e) => openContextMenu(e, [
                      { label: 'Editar projeto', icon: <LuPencil className="size-3.5" />, onClick: () => openProjectDialog({ kind: 'edit-project', project }) },
                      { separator: true },
                      { label: 'Excluir projeto', icon: <LuTrash2 className="size-3.5" />, danger: true, onClick: () => openProjectDialog({ kind: 'delete-project', project }) },
                    ], setContextMenu)}>
                    <IconDisplay value={project.icon} className="shrink-0 text-base" />
                    <span className="min-w-0 flex-1 truncate text-left">{project.name}</span>
                  </button>
                ))}
                <button type="button" title="Novo projeto"
                  className="mt-2 grid h-7 w-full place-items-center rounded-lg border border-dashed text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => openProjectDialog({ kind: 'create-project' })}>
                  <LuPlus className="size-3.5" />
                </button>
              </div>
            )}


          </aside>
        </>
      )}

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />
      )}

      {dialog && (dialog.kind === 'create-project' || dialog.kind === 'edit-project') && (
        <ProjectFormDialog title={dialog.kind === 'create-project' ? 'Novo projeto' : 'Editar projeto'}
          icon={projIcon} name={projName} description={projDesc} busy={busy}
          onIconChange={setProjIcon} onNameChange={setProjName} onDescriptionChange={setProjDesc}
          onCancel={() => setDialog(null)} onConfirm={() => void confirmProjectDialog()} />
      )}
      {dialog && dialog.kind === 'delete-project' && (
        <ConfirmDialog title="Excluir projeto"
          description={`"${dialog.project.name}" e todas as suas páginas e labels serão removidos permanentemente.`}
          confirmLabel="Excluir" busy={busy} onCancel={() => setDialog(null)} onConfirm={() => void confirmProjectDialog()} />
      )}
      {dialog && (dialog.kind === 'create-list' || dialog.kind === 'edit-list') && (
        <ListFormDialog
          labels={labels}
          lists={lists}
          currentListId={dialog.kind === 'edit-list' ? dialog.list.id : undefined}
          selectedLabelId={selectedLabelId}
          description={listDesc} busy={busy}
          onLabelSelect={setSelectedLabelId} onDescriptionChange={setListDesc}
          onCancel={() => setDialog(null)} onConfirm={() => void confirmListDialog()}
          onCreateLabel={createLabelForList} />
      )}
      {dialog && dialog.kind === 'delete-page' && (
        <ConfirmDialog title="Excluir página"
          description={`"${dialog.page.title}" será removida permanentemente.`}
          confirmLabel="Excluir" busy={busy} onCancel={() => setDialog(null)} onConfirm={() => void confirmDeletePage()} />
      )}
      {pageDialog && (
        <PageFormDialog page={pageDialog.page} labels={labels} defaultLabelId={pageDialog.defaultLabelId} busy={busy}
          onDelete={pageDialog.page ? () => setDialog({ kind: 'delete-page', page: pageDialog.page! }) : undefined}
          onCancel={() => setPageDialog(null)} onSave={(data) => void savePageDialog(data)} />
      )}
      {failure && <FailureToast message={failure} onDismiss={() => setFailure(null)} />}
    </Fragment>
  )
}

// ─── info view ────────────────────────────────────────────────────────────────

function LabelRow({ label, onEdit, onDelete }: {
  label: DraftLabel; onEdit: () => void; onDelete: () => void
}) {
  return (
    <div className="group flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: label.color }} />
      <span className="min-w-0 flex-1 text-sm">{label.name}</span>
      <button type="button" title="Editar"
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
        onClick={onEdit}>
        <LuPencil className="size-3.5" />
      </button>
      <button type="button" title="Excluir"
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
        onClick={onDelete}>
        <LuTrash2 className="size-3.5" />
      </button>
    </div>
  )
}

function InfoView({ project, labels, busy, onSave, onDeleteProject }: {
  project: TodoProject
  labels: TodoLabel[]
  busy: boolean
  onSave: (icon: string, name: string, desc: string, draft: DraftLabel[]) => void
  onDeleteProject: () => void
}) {
  const [icon, setIcon] = useState(project.icon)
  const [name, setName] = useState(project.name)
  const [desc, setDesc] = useState(project.description)
  const [draftLabels, setDraftLabels] = useState<DraftLabel[]>(() => labelsTooDraft(labels))
  const savedLabels = useRef(labels)

  const [labelDlg, setLabelDlg] = useState<{ kind: 'create' } | { kind: 'edit'; tempId: string } | null>(null)
  const [dlgName, setDlgName] = useState('')
  const [dlgColor, setDlgColor] = useState('#6366f1')

  useEffect(() => {
    setIcon(project.icon); setName(project.name); setDesc(project.description)
    const draft = labelsTooDraft(labels)
    setDraftLabels(draft)
    savedLabels.current = labels
  }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (savedLabels.current !== labels) {
      savedLabels.current = labels
      setDraftLabels(labelsTooDraft(labels))
    }
  }, [labels])

  const openCreate = () => { setDlgName(''); setDlgColor('#6366f1'); setLabelDlg({ kind: 'create' }) }
  const openEdit = (tempId: string) => {
    const l = draftLabels.find((d) => d.tempId === tempId)!
    setDlgName(l.name); setDlgColor(l.color); setLabelDlg({ kind: 'edit', tempId })
  }
  const confirmCreate = () => {
    setDraftLabels((prev) => [...prev, { tempId: `n${Date.now()}`, name: dlgName, color: dlgColor }])
    setLabelDlg(null)
  }
  const confirmEdit = (tempId: string) => {
    setDraftLabels((prev) => prev.map((d) => d.tempId === tempId ? { ...d, name: dlgName, color: dlgColor } : d))
    setLabelDlg(null)
  }
  const deleteLabel = (tempId: string) => setDraftLabels((prev) => prev.filter((d) => d.tempId !== tempId))

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <div className="flex items-end gap-4">
          <div>
            <span className="mb-2 block text-sm font-medium">Ícone</span>
            <IconPicker value={icon} onChange={setIcon} />
          </div>
          <label className="flex-1 text-sm font-medium">
            Nome
            <input value={name} maxLength={100} disabled={busy} autoComplete="off"
              className="field-input mt-2 w-full font-normal"
              onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
          <textarea value={desc} maxLength={500} disabled={busy} rows={3}
            className="mt-2 w-full resize-none rounded-lg border bg-card p-3 text-sm font-normal outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(e) => setDesc(e.target.value)} />
        </label>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Labels</span>
            <button type="button" title="Nova label"
              className="grid size-6 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={openCreate}>
              <LuPlus className="size-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            {draftLabels.map((label) => (
              <LabelRow key={label.tempId} label={label}
                onEdit={() => openEdit(label.tempId)}
                onDelete={() => deleteLabel(label.tempId)} />
            ))}
          </div>
          <button type="button"
            className="mt-2 grid h-7 w-full place-items-center rounded-lg border border-dashed text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            onClick={openCreate}>
            <LuPlus className="size-3.5" />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <button type="button" title="Excluir projeto" disabled={busy}
            className="grid size-9 place-items-center rounded-lg border text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            onClick={onDeleteProject}>
            <LuTrash2 className="size-4" />
          </button>
          <button type="button" disabled={busy || name.trim().length < 3}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            onClick={() => onSave(icon, name, desc, draftLabels)}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {labelDlg?.kind === 'create' && (
        <LabelFormDialog title="Nova label" name={dlgName} color={dlgColor} busy={false}
          onNameChange={setDlgName} onColorChange={setDlgColor}
          onCancel={() => setLabelDlg(null)} onConfirm={confirmCreate} />
      )}
      {labelDlg?.kind === 'edit' && (
        <LabelFormDialog title="Editar label" name={dlgName} color={dlgColor} busy={false}
          onNameChange={setDlgName} onColorChange={setDlgColor}
          onCancel={() => setLabelDlg(null)} onConfirm={() => confirmEdit(labelDlg.tempId)} />
      )}
    </div>
  )
}

// ─── kanban ───────────────────────────────────────────────────────────────────

function KanbanBoard({ lists, labels, pages, onOpenPage, onNewPage, onCreateList, onEditList }: {
  lists: TodoList[]; labels: TodoLabel[]; pages: TodoPage[]
  onOpenPage: (page: TodoPage) => void
  onNewPage: (list: TodoList) => void
  onCreateList: () => void
  onEditList: (list: TodoList, label: TodoLabel) => void
}) {
  const sortedLists = [...lists].sort((a, b) => a.sortOrder - b.sortOrder)
  if (sortedLists.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-muted-foreground">
        <LuKanban className="size-8 opacity-30" strokeWidth={1.5} />
        <p className="text-sm">Nenhuma lista ainda.</p>
        <button type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
          onClick={onCreateList}>
          <LuPlus className="size-3.5" />Nova lista
        </button>
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-4 overflow-x-auto p-6">
      <SortableContext items={sortedLists.map((l) => `list-${l.id}`)} strategy={horizontalListSortingStrategy}>
        {sortedLists.map((list) => {
          const label = labels.find((l) => l.id === list.labelId)
          if (!label) return null
          const col = pages.filter((p) => p.labelIds.includes(list.labelId)).sort((a, b) => a.sortOrder - b.sortOrder)
          return <KanbanColumn key={list.id} list={list} label={label} pages={col}
                   onOpenPage={onOpenPage} onNewPage={() => onNewPage(list)}
                   onEditList={() => onEditList(list, label)} />
        })}
      </SortableContext>
      <button type="button" title="Nova lista"
        className="flex min-w-72 max-w-96 flex-1 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed bg-card text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
        onClick={onCreateList}>
        <LuPlus className="size-5" />
      </button>
    </div>
  )
}

function KanbanColumn({ list, label, pages, onOpenPage, onNewPage, onEditList }: {
  list: TodoList; label: TodoLabel; pages: TodoPage[]
  onOpenPage: (page: TodoPage) => void; onNewPage: () => void; onEditList: () => void
}) {
  const { attributes, listeners, setNodeRef: setSortRef, transform, transition, isDragging } = useSortable({
    id: `list-${list.id}`,
    data: { type: 'list', listId: list.id },
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `col-${list.id}`, data: { listId: list.id } })
  return (
    <section ref={setSortRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex min-w-72 max-w-96 flex-1 flex-col rounded-xl border bg-card shadow-sm transition-colors ${isOver ? 'border-primary/50 bg-primary/5' : ''} ${isDragging ? 'opacity-0' : ''}`}>
      <div {...attributes} {...listeners}
        className="flex shrink-0 cursor-grab items-center justify-between border-b px-4 py-3 active:cursor-grabbing">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: label.color }} />
          <span className="text-sm font-semibold">{label.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {pages.length > 0 && (
            <>
              <span className="text-xs tabular-nums text-muted-foreground">{pages.length}</span>
              <span className="text-xs text-border select-none">|</span>
            </>
          )}
          <button type="button" title="Editar lista"
            className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onEditList}>
            <LuPencil className="size-3" />
          </button>
          <button type="button" title="Adicionar página"
            className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onNewPage}>
            <LuPlus className="size-3.5" />
          </button>
        </div>
      </div>
      <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div ref={setDropRef} className="flex-1 p-3 space-y-2">
          {pages.map((page) => (
            <SortableCard key={page.id} page={page} listId={list.id} onClick={() => onOpenPage(page)} />
          ))}
          <button type="button" title="Adicionar página"
            className="grid h-6 w-full place-items-center rounded-md border border-dashed text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onNewPage}>
            <LuPlus className="size-3.5" />
          </button>
        </div>
      </SortableContext>
    </section>
  )
}

function SortableCard({ page, listId, onClick }: { page: TodoPage; listId: number; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id, data: { listId } })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : undefined }}>
      <PageCardInner page={page} onClick={onClick} dragProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

function PageCardOverlay({ page, labels }: { page: TodoPage; labels: TodoLabel[] }) {
  return <PageCardInner page={page} labels={labels} isOverlay />
}

function KanbanColumnOverlay({ label, pageCount }: { label: TodoLabel; pageCount: number }) {
  return (
    <section className="flex w-72 min-w-72 flex-col rounded-xl border bg-card shadow-2xl ring-2 ring-primary/30 rotate-1 opacity-95">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: label.color }} />
          <span className="text-sm font-semibold">{label.name}</span>
        </div>
        {pageCount > 0 && <span className="text-xs tabular-nums text-muted-foreground">{pageCount}</span>}
      </div>
      <div className="flex-1 p-3">
        <div className="rounded-md border border-dashed bg-muted/20 py-6 text-center text-xs text-muted-foreground/40">
          {pageCount === 1 ? '1 página' : `${pageCount} páginas`}
        </div>
      </div>
    </section>
  )
}

function PageCardInner({ page, labels, onClick, dragProps, isOverlay }: {
  page: TodoPage; labels?: TodoLabel[]; onClick?: () => void
  dragProps?: Record<string, unknown>; isOverlay?: boolean
}) {
  const overdue = page.dueDate && new Date(page.dueDate) < new Date()
  return (
    <div className={`group flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted ${isOverlay ? 'shadow-lg ring-1 ring-primary/40 rotate-1' : ''}`}>
      <div className="flex items-start gap-2">
        <button type="button" className="flex min-w-0 flex-1 items-start text-left" onClick={onClick} tabIndex={isOverlay ? -1 : undefined}>
          <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug">{page.title}</span>
        </button>
        <div {...dragProps} className="mt-0.5 shrink-0 cursor-grab text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing" aria-label="Arrastar">
          <LuGripVertical className="size-3.5" />
        </div>
      </div>
      {labels && page.labelIds.length > 0 && (
        <div className="flex flex-wrap gap-1 group-hover:hidden">
          {page.labelIds.map((id) => {
            const lbl = labels.find((l) => l.id === id)
            if (!lbl) return null
            return <span key={id} className="inline-flex items-center rounded-full px-1.5 py-px text-xs font-medium text-white" style={{ background: lbl.color }}>{lbl.name}</span>
          })}
        </div>
      )}
      {page.dueDate && (
        <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
          <LuCalendar className="size-3 shrink-0" />{formatDate(page.dueDate)}
        </div>
      )}
    </div>
  )
}

// ─── list view ────────────────────────────────────────────────────────────────

function ListView({ labels, pages, onOpenPage }: {
  labels: TodoLabel[]; pages: TodoPage[]; onOpenPage: (page: TodoPage) => void
}) {
  const [filterLabelId, setFilterLabelId] = useState<number | null>(null)
  const filtered = (filterLabelId ? pages.filter((p) => p.labelIds.includes(filterLabelId)) : pages)
    .slice().sort((a, b) => a.sortOrder - b.sortOrder)

  if (pages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-muted-foreground">
        <LuCircleDot className="size-8 opacity-30" strokeWidth={1.5} />
        <p className="text-sm">Nenhuma página ainda. Crie a primeira acima.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {labels.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-6 py-2.5">
          <button type="button"
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${filterLabelId === null ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            onClick={() => setFilterLabelId(null)}>
            Todas
          </button>
          {labels.map((label) => {
            const active = filterLabelId === label.id
            return (
              <button key={label.id} type="button"
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all"
                style={{ background: active ? label.color : undefined, color: active ? 'white' : undefined, border: `1.5px solid ${label.color}` }}
                onClick={() => setFilterLabelId(active ? null : label.id)}>
                {label.name}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Nenhuma página com essa label.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((page) => {
              const overdue = page.dueDate && new Date(page.dueDate) < new Date()
              const pageLabels = labels.filter((l) => page.labelIds.includes(l.id))
              return (
                <button key={page.id} type="button"
                  className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-muted"
                  onClick={() => onOpenPage(page)}>
                  <IconDisplay value={page.icon} className="shrink-0 text-base" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{page.title}</span>
                  {pageLabels.length > 0 && (
                    <div className="flex shrink-0 items-center gap-1">
                      {pageLabels.slice(0, 3).map((l) => (
                        <span key={l.id} className="inline-block size-2 rounded-full" title={l.name} style={{ background: l.color }} />
                      ))}
                    </div>
                  )}
                  {page.dueDate && (
                    <span className={`flex shrink-0 items-center gap-1 text-xs ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                      <LuCalendar className="size-3" />{formatDate(page.dueDate)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── empty state ──────────────────────────────────────────────────────────────

function NoProjectState() {
  return (
    <div className="animate-in fade-in flex h-full items-center justify-center p-6 duration-200">
      <LuMousePointerClick className="size-20 text-muted-foreground/40" strokeWidth={1.25} />
    </div>
  )
}

// ─── dialogs ──────────────────────────────────────────────────────────────────

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6 backdrop-blur-[2px]" role="presentation" onMouseDown={onClose}>
      {children}
    </div>
  )
}

function DialogBox({ children, labelId, onStopPropagation, dialogRef }: {
  children: React.ReactNode; labelId: string
  onStopPropagation: (e: React.MouseEvent) => void; dialogRef: React.RefObject<HTMLElement | null>
}) {
  return (
    <section ref={dialogRef as React.RefObject<HTMLElement>} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={labelId}
      className="w-full max-w-md rounded-2xl border bg-popover p-6 shadow-2xl" onMouseDown={onStopPropagation}>
      {children}
    </section>
  )
}

function DialogFooter({ busy, canConfirm, onCancel, onConfirm }: {
  busy: boolean; canConfirm: boolean; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button type="button" disabled={busy}
        className="h-9 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        onClick={onCancel}>Cancelar</button>
      <button type="button" disabled={busy || !canConfirm}
        className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        onClick={onConfirm}>{busy ? 'Salvando…' : 'Salvar'}</button>
    </div>
  )
}

function ProjectFormDialog({ title, icon, name, description, busy, onIconChange, onNameChange, onDescriptionChange, onCancel, onConfirm }: {
  title: string; icon: string; name: string; description: string; busy: boolean
  onIconChange: (v: string) => void; onNameChange: (v: string) => void; onDescriptionChange: (v: string) => void
  onCancel: () => void; onConfirm: () => void
}) {
  const dialogRef = useModalDialog(true, busy ? undefined : onCancel)
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  return (
    <Backdrop onClose={() => { if (!busy) onCancel() }}>
      <DialogBox labelId="proj-dlg-title" onStopPropagation={stop} dialogRef={dialogRef}>
        <h2 id="proj-dlg-title" className="text-lg font-semibold tracking-tight">{title}</h2>
        <div className="mt-5 space-y-4">
          <div className="flex items-end gap-3">
            <div className="text-sm font-medium">
              Ícone
              <div className="mt-2">
                <IconPicker value={icon} onChange={onIconChange} />
              </div>
            </div>
            <label className="flex-1 text-sm font-medium">Nome
              <input data-dialog-initial-focus value={name} maxLength={100} disabled={busy} autoComplete="off"
                className="field-input mt-2 w-full font-normal" onChange={(e) => onNameChange(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm font-medium">Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
            <textarea value={description} maxLength={500} disabled={busy} rows={2}
              className="mt-2 w-full resize-none rounded-lg border bg-card p-3 text-sm font-normal outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(e) => onDescriptionChange(e.target.value)} />
          </label>
        </div>
        <DialogFooter busy={busy} canConfirm={name.trim().length >= 3} onCancel={onCancel} onConfirm={onConfirm} />
      </DialogBox>
    </Backdrop>
  )
}

function LabelCombobox({ labels, lists, currentListId, selectedLabelId, disabled, onSelect }: {
  labels: TodoLabel[]; lists: TodoList[]; currentListId?: number
  selectedLabelId: number | null; disabled?: boolean
  onSelect: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0)
  }, [open])

  const linkedIds = new Set(lists.filter((l) => l.id !== currentListId).map((l) => l.labelId))
  const selected = labels.find((l) => l.id === selectedLabelId)
  const filtered = labels.filter((l) => l.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={containerRef} className="relative">
      <button type="button" disabled={disabled}
        className="field-input flex w-full items-center gap-2 text-left"
        onPointerDown={(e) => { e.preventDefault(); if (!disabled) setOpen((o) => !o) }}>
        {selected ? (
          <>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: selected.color }} />
            <span className="flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-muted-foreground">Selecionar label…</span>
        )}
        <LuChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-xl">
          <div className="relative border-b">
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input ref={searchRef} value={search} placeholder="Buscar label…"
              className="h-9 w-full bg-transparent pl-8 pr-3 text-sm outline-none"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setSearch('') } }} />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma label encontrada.</p>
            )}
            {filtered.map((label) => {
              const inUse = linkedIds.has(label.id)
              const isSelected = selectedLabelId === label.id
              return (
                <button key={label.id} type="button" disabled={inUse}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors
                    ${inUse ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted'}
                    ${isSelected ? 'bg-muted/60' : ''}`}
                  onClick={() => { if (!inUse) { onSelect(label.id); setOpen(false); setSearch('') } }}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: label.color }} />
                  <span className="flex-1 truncate text-left">{label.name}</span>
                  {inUse && <LuLock className="size-3 shrink-0 text-muted-foreground" />}
                  {isSelected && !inUse && <LuCheck className="size-3.5 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ListFormDialog({ labels, lists, currentListId, selectedLabelId, description, busy, onLabelSelect, onDescriptionChange, onCancel, onConfirm, onCreateLabel }: {
  labels: TodoLabel[]; lists: TodoList[]
  currentListId?: number
  selectedLabelId: number | null; description: string; busy: boolean
  onLabelSelect: (id: number | null) => void; onDescriptionChange: (v: string) => void
  onCancel: () => void; onConfirm: () => void
  onCreateLabel: (name: string, color: string) => Promise<TodoLabel | null>
}) {
  const dialogRef = useModalDialog(true, busy ? undefined : onCancel)
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const [inlineOpen, setInlineOpen] = useState(false)
  const [inlineName, setInlineName] = useState('')
  const [inlineColor, setInlineColor] = useState('#6366f1')
  const [inlineBusy, setInlineBusy] = useState(false)

  const confirmInline = async () => {
    if (!inlineName.trim()) return
    setInlineBusy(true)
    const created = await onCreateLabel(inlineName.trim(), inlineColor)
    setInlineBusy(false)
    if (created) {
      onLabelSelect(created.id)
      setInlineOpen(false)
      setInlineName('')
      setInlineColor('#6366f1')
    }
  }

  return (
    <Backdrop onClose={() => { if (!busy) onCancel() }}>
      <DialogBox labelId="list-dlg-title" onStopPropagation={stop} dialogRef={dialogRef}>
        <span id="list-dlg-title" className="sr-only">Lista</span>
        <div className="space-y-4">
          <div className="text-sm font-medium">
            <div className="flex items-center justify-between">
              <span>Label</span>
              <button type="button" disabled={busy || inlineBusy} title="Nova label"
                className="grid size-5 place-items-center rounded border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                onClick={() => { setInlineOpen((o) => !o); setInlineName(''); setInlineColor('#6366f1') }}>
                <LuPlus className="size-3" />
              </button>
            </div>
            <div className="mt-2">
              <LabelCombobox labels={labels} lists={lists} currentListId={currentListId}
                selectedLabelId={selectedLabelId} disabled={busy || inlineBusy}
                onSelect={(id) => onLabelSelect(id)} />
            </div>
            {inlineOpen && (
              <div className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <span className="size-3.5 shrink-0 rounded-full"
                    style={{ background: /^#[0-9a-fA-F]{6}$/.test(inlineColor) ? inlineColor : '#94a3b8' }} />
                  <input value={inlineName} maxLength={50} disabled={inlineBusy} autoFocus
                    placeholder="Nome da label…"
                    className="flex-1 rounded-md border bg-card px-2.5 py-1.5 text-sm font-normal outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(e) => setInlineName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void confirmInline(); if (e.key === 'Escape') setInlineOpen(false) }} />
                </div>
                <ColorPicker color={inlineColor} onChange={setInlineColor} />
                <div className="flex justify-end gap-2">
                  <button type="button" disabled={inlineBusy}
                    className="h-7 rounded-md px-2.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    onClick={() => setInlineOpen(false)}>Cancelar</button>
                  <button type="button" disabled={inlineBusy || !inlineName.trim()}
                    className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    onClick={() => void confirmInline()}>
                    {inlineBusy ? 'Criando…' : 'Criar'}
                  </button>
                </div>
              </div>
            )}
            {labels.length === 0 && !inlineOpen && (
              <p className="mt-1.5 text-xs text-muted-foreground">Nenhuma label ainda. Use "+" para criar.</p>
            )}
          </div>
          <label className="block text-sm font-medium">
            Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
            <textarea value={description} maxLength={500} disabled={busy} rows={3}
              className="mt-2 w-full resize-none rounded-lg border bg-card p-3 text-sm font-normal outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(e) => onDescriptionChange(e.target.value)} />
          </label>
        </div>
        <DialogFooter busy={busy} canConfirm={selectedLabelId !== null} onCancel={onCancel} onConfirm={onConfirm} />
      </DialogBox>
    </Backdrop>
  )
}

const PRESET_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#94a3b8', '#6366f1']

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 rounded-full"
          style={{ background: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#94a3b8' }} />
        <input type="text" value={color} maxLength={7} autoComplete="off"
          className="field-input w-full pl-8 font-mono text-sm"
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v)
          }} />
      </div>
      <div className="grid grid-cols-5 gap-2">
        {PRESET_COLORS.map((c) => (
          <button key={c} type="button"
            className="size-7 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ background: c, outline: color === c ? `2px solid ${c}` : undefined, outlineOffset: 3 }}
            onClick={() => onChange(c)}>
            {color === c && <LuCheck className="m-auto size-3.5 text-white" />}
          </button>
        ))}
      </div>
    </div>
  )
}

function LabelFormDialog({ title, name, color, busy, onNameChange, onColorChange, onCancel, onConfirm }: {
  title: string; name: string; color: string; busy: boolean
  onNameChange: (v: string) => void; onColorChange: (v: string) => void
  onCancel: () => void; onConfirm: () => void
}) {
  const dialogRef = useModalDialog(true, busy ? undefined : onCancel)
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  return (
    <Backdrop onClose={() => { if (!busy) onCancel() }}>
      <DialogBox labelId="lbl-dlg-title" onStopPropagation={stop} dialogRef={dialogRef}>
        <h2 id="lbl-dlg-title" className="text-lg font-semibold tracking-tight">{title}</h2>
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="size-3.5 shrink-0 rounded-full transition-colors" style={{ background: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#94a3b8' }} />
            <label className="flex-1 text-sm font-medium">Nome
              <input data-dialog-initial-focus value={name} maxLength={50} disabled={busy} autoComplete="off"
                className="field-input mt-2 w-full font-normal" onChange={(e) => onNameChange(e.target.value)} />
            </label>
          </div>
          <div className="text-sm font-medium">Cor
            <div className="mt-2">
              <ColorPicker color={color} onChange={onColorChange} />
            </div>
          </div>
        </div>
        <DialogFooter busy={busy} canConfirm={!!name.trim()} onCancel={onCancel} onConfirm={onConfirm} />
      </DialogBox>
    </Backdrop>
  )
}

function ConfirmDialog({ title, description, confirmLabel, busy, onCancel, onConfirm }: {
  title: string; description: string; confirmLabel: string; busy: boolean
  onCancel: () => void; onConfirm: () => void
}) {
  const dialogRef = useModalDialog(true, busy ? undefined : onCancel)
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  return (
    <Backdrop onClose={() => { if (!busy) onCancel() }}>
      <DialogBox labelId="confirm-dlg-title" onStopPropagation={stop} dialogRef={dialogRef}>
        <h2 id="confirm-dlg-title" className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button data-dialog-initial-focus type="button" disabled={busy}
            className="h-9 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            onClick={onCancel}>Cancelar</button>
          <button type="button" disabled={busy}
            className="h-9 rounded-lg bg-destructive px-3 text-sm font-medium text-white transition-colors hover:brightness-95 disabled:opacity-50"
            onClick={onConfirm}>{busy ? 'Excluindo…' : confirmLabel}</button>
        </div>
      </DialogBox>
    </Backdrop>
  )
}

function PageFormDialog({ page, labels, defaultLabelId, busy, onDelete, onCancel, onSave }: {
  page: TodoPage | null; labels: TodoLabel[]; defaultLabelId: number | null; busy: boolean
  onDelete?: () => void; onCancel: () => void
  onSave: (data: { icon: string; title: string; content: string; labelIds: number[]; dueDate: string }) => void
}) {
  const [icon, setIcon] = useState(() => page?.icon ?? DEFAULT_ICON_VALUE)
  const [title, setTitle] = useState(page?.title ?? 'Nova página')
  const [content, setContent] = useState(page?.content ?? '')
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>(page?.labelIds ?? (defaultLabelId ? [defaultLabelId] : []))
  const [dueDate, setDueDate] = useState(page?.dueDate ?? '')
  const dialogRef = useModalDialog(true, busy ? undefined : onCancel)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  const toggleLabel = (id: number) =>
    setSelectedLabelIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const submit = () => {
    if (!title.trim() || busy) return
    onSave({ icon: icon || '📄', title: title.trim(), content, labelIds: selectedLabelIds, dueDate })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6 backdrop-blur-[2px]" role="presentation"
      onMouseDown={() => { if (!busy) onCancel() }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="page-dlg-title"
        className="flex w-full max-w-2xl flex-col rounded-2xl border bg-popover shadow-2xl"
        style={{ maxHeight: 'calc(100vh - 48px)' }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center gap-3 border-b px-5 py-4">
          <IconPicker value={icon} onChange={setIcon} size="sm" />
          <input ref={titleRef} id="page-dlg-title" value={title} maxLength={60} disabled={busy} placeholder="Título da página…"
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
            onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }} />
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-x-5 gap-y-3 border-b px-5 py-3">
          <div>
            <span className="mb-1.5 block text-xs text-muted-foreground">Labels</span>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((label) => {
                const on = selectedLabelIds.includes(label.id)
                return (
                  <button key={label.id} type="button" disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all"
                    style={{ background: on ? label.color : undefined, color: on ? 'white' : undefined, border: `1.5px solid ${label.color}` }}
                    onClick={() => toggleLabel(label.id)}>
                    {on && <LuCheck className="size-3" />}{label.name}
                  </button>
                )
              })}
              {labels.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma label no projeto.</span>}
            </div>
          </div>
          <label className="flex flex-col text-xs text-muted-foreground">Vencimento
            <input type="date" value={dueDate} disabled={busy}
              className="mt-1.5 rounded-md border bg-card px-2 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(e) => setDueDate(e.target.value)} />
          </label>
          {page && (
            <span className="self-end text-xs text-muted-foreground">
              Criada {formatDate(page.createdAt)} · Atualizada {formatDate(page.updatedAt)}
            </span>
          )}
        </div>
        <textarea value={content} disabled={busy} placeholder="Escreva o conteúdo em Markdown…"
          className="min-h-48 flex-1 resize-none bg-transparent px-5 py-4 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground/40"
          onChange={(e) => setContent(e.target.value)} />
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-5 py-4">
          <div>
            {onDelete && (
              <button type="button" disabled={busy}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                onClick={onDelete}>
                <LuTrash2 className="size-4" />Excluir
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy}
              className="h-9 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              onClick={onCancel}>Cancelar</button>
            <button type="button" disabled={busy || !title.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              onClick={submit}>
              {busy && <LuLoaderCircle className="size-3.5 animate-spin" />}
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── toast ────────────────────────────────────────────────────────────────────

function FailureToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div role="alert" aria-live="assertive"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-destructive/40 bg-popover px-4 py-3 shadow-xl">
      <span className="text-sm text-destructive">{message}</span>
      <button type="button" aria-label="Fechar" onClick={onDismiss}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}

// ─── utils ────────────────────────────────────────────────────────────────────

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}
