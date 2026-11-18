import { useMemo, useState, type ReactNode } from 'react'
import type { IconType } from 'react-icons'
import {
  LuBraces,
  LuChevronDown,
  LuChevronRight,
  LuCopy,
  LuEllipsis,
  LuFilePlus2,
  LuFolder,
  LuFolderPlus,
  LuFolderTree,
  LuPencil,
  LuPlus,
  LuSearch,
  LuTrash2,
} from 'react-icons/lu'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ApiClientCollection, ApiClientFolder, ApiClientRequestSummary } from '../../api'
import { cn } from '../../shared/lib/cn'

type ApiClientCollectionTreeProps = {
  collections: ApiClientCollection[]
  folders: ApiClientFolder[]
  requests: ApiClientRequestSummary[]
  activeRequestId: number | null
  onCreateCollection: () => void
  onCreateFolder: (collectionId: number, parentId: number | null) => void
  onCreateRequest: (collectionId: number | null, folderId: number | null) => void
  onOpenRequest: (id: number) => void
  onRenameCollection: (collection: ApiClientCollection) => void
  onRenameFolder: (folder: ApiClientFolder) => void
  onDeleteCollection: (collection: ApiClientCollection) => void
  onDeleteFolder: (folder: ApiClientFolder) => void
  onDuplicateRequest: (request: ApiClientRequestSummary) => void
  onDeleteRequest: (request: ApiClientRequestSummary) => void
  onOpenCollection?: (collection: ApiClientCollection) => void
  onOpenVariables?: (collection: ApiClientCollection) => void
  onReorderCollections?: (ids: number[]) => void
  onReorderFolders?: (ids: number[]) => void
  onReorderRequests?: (ids: number[]) => void
  onMoveRequest?: (requestId: number, collectionId: number | null, folderId: number | null) => void
}

type BranchActions = Omit<
  ApiClientCollectionTreeProps,
  | 'collections'
  | 'folders'
  | 'requests'
  | 'onCreateCollection'
  | 'onReorderCollections'
  | 'onReorderFolders'
  | 'onReorderRequests'
  | 'onMoveRequest'
>

type TreeData = {
  foldersByParent: Map<string, ApiClientFolder[]>
  requestsByFolder: Map<string, ApiClientRequestSummary[]>
}

type DragItemType = 'collection' | 'folder' | 'request'

type DragItem = {
  type: DragItemType
  id: number
  collectionId?: number | null
  folderId?: number | null
  containerId: string
}

function parseDragId(id: string): { type: DragItemType; itemId: number } | null {
  const [prefix, rawId] = id.split(':')
  const itemId = Number(rawId)
  if (isNaN(itemId)) return null
  if (prefix === 'col') return { type: 'collection', itemId }
  if (prefix === 'fol') return { type: 'folder', itemId }
  if (prefix === 'req') return { type: 'request', itemId }
  return null
}

export function ApiClientCollectionTree({
  collections,
  folders,
  requests,
  activeRequestId,
  onCreateCollection,
  onOpenCollection,
  onReorderCollections,
  onReorderFolders,
  onReorderRequests,
  onMoveRequest,
  ...actions
}: ApiClientCollectionTreeProps) {
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const term = filter.trim().toLocaleLowerCase('pt-BR')
  const tree = useMemo<TreeData>(
    () => ({ foldersByParent: groupFolders(folders), requestsByFolder: groupRequests(requests) }),
    [folders, requests],
  )
  const visibleCollections = collections.filter((collection) =>
    matchesCollection(collection, tree, term),
  )
  const drafts = tree.requestsByFolder.get('drafts') ?? []

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveDragId(String(active.id))
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null)
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const activeData = active.data.current as DragItem | undefined
    const overData = over.data.current as DragItem | undefined

    if (!activeData || !overData) return

    // Sort collections
    if (activeData.type === 'collection' && overData.type === 'collection') {
      const oldIndex = collections.findIndex((c) => c.id === activeData.id)
      const newIndex = collections.findIndex((c) => c.id === overData.id)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        onReorderCollections?.(arrayMove(collections, oldIndex, newIndex).map((c) => c.id))
      }
      return
    }

    // Sort folders
    if (activeData.type === 'folder' && overData.type === 'folder') {
      const containerFolders = folders.filter(
        (f) =>
          f.collectionId === activeData.collectionId &&
          f.parentId === (activeData.folderId ?? null),
      )
      const oldIndex = containerFolders.findIndex((f) => f.id === activeData.id)
      const newIndex = containerFolders.findIndex((f) => f.id === overData.id)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const otherFolders = folders
          .filter((f) => !(f.collectionId === activeData.collectionId && f.parentId === (activeData.folderId ?? null)))
          .map((f) => f.id)
        onReorderFolders?.(
          [...otherFolders, ...arrayMove(containerFolders, oldIndex, newIndex).map((f) => f.id)],
        )
      }
      return
    }

    // Sort/move requests
    if (activeData.type === 'request') {
      const sameContainer =
        activeData.collectionId === overData.collectionId &&
        activeData.folderId === overData.folderId

      if (overData.type === 'request' && sameContainer) {
        // Reorder within same container
        const containerRequests = requests.filter(
          (r) => r.collectionId === activeData.collectionId && r.folderId === activeData.folderId,
        )
        const oldIndex = containerRequests.findIndex((r) => r.id === activeData.id)
        const newIndex = containerRequests.findIndex((r) => r.id === overData.id)
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const others = requests
            .filter(
              (r) =>
                !(
                  r.collectionId === activeData.collectionId &&
                  r.folderId === activeData.folderId
                ),
            )
            .map((r) => r.id)
          onReorderRequests?.(
            [...others, ...arrayMove(containerRequests, oldIndex, newIndex).map((r) => r.id)],
          )
        }
        return
      }

      if (!sameContainer) {
        // Cross-container move
        const targetCollectionId =
          overData.type === 'collection'
            ? overData.id
            : overData.type === 'folder'
              ? (overData.collectionId ?? null)
              : overData.collectionId ?? null
        const targetFolderId =
          overData.type === 'folder'
            ? overData.id
            : overData.type === 'request'
              ? overData.folderId ?? null
              : null

        onMoveRequest?.(activeData.id, targetCollectionId, targetFolderId)
      }
    }

    void activeId, overId
  }

  // Find active drag item info for overlay
  const activeParsed = activeDragId ? parseDragId(activeDragId) : null
  const activeRequest =
    activeParsed?.type === 'request'
      ? requests.find((r) => r.id === activeParsed.itemId)
      : null
  const activeCollection =
    activeParsed?.type === 'collection'
      ? collections.find((c) => c.id === activeParsed.itemId)
      : null
  const activeFolder =
    activeParsed?.type === 'folder'
      ? folders.find((f) => f.id === activeParsed.itemId)
      : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <section className="flex h-full min-h-0 flex-col gap-4" aria-label="Coleções">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-sm font-medium">Coleções</h2>
            {collections.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                {collections.length}
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="Nova coleção"
            title="Nova coleção"
            className="grid size-7 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onCreateCollection}
          >
            <LuPlus className="size-3.5" />
          </button>
        </div>
        <label className="relative block">
          <span className="sr-only">Pesquisar coleções e requests</span>
          <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            autoComplete="off"
            placeholder="Buscar coleções e requests"
            className="h-9 w-full rounded-lg border bg-card pr-3 pl-9 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <hr />
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1" role="tree">
          {collections.length === 0 ? (
            <EmptyCollections onCreate={onCreateCollection} />
          ) : visibleCollections.length === 0 && drafts.length === 0 ? (
            <EmptySearch filter={filter} />
          ) : (
            <SortableContext
              items={visibleCollections.map((c) => `col-${c.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {visibleCollections.map((collection) => (
                <CollectionBranch
                  key={collection.id}
                  collection={collection}
                  tree={tree}
                  filter={term}
                  collapsed={collapsed}
                  activeRequestId={activeRequestId}
                  onToggle={toggle}
                  onOpenCollection={onOpenCollection}
                  {...actions}
                />
              ))}
            </SortableContext>
          )}

          {/* Rascunhos section */}
          {(drafts.length > 0 || !term) && (
            <>
              {collections.length > 0 && <div className="my-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-medium text-muted-foreground">Rascunhos</span>
                <div className="h-px flex-1 bg-border" />
              </div>}
              {drafts.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">Nenhum rascunho.</p>
              ) : (
                <SortableContext
                  items={drafts.map((r) => `req-${r.id}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {drafts.map((request) => (
                    <SortableRequestLeaf
                      key={request.id}
                      request={request}
                      filter={term}
                      containerId="drafts"
                      activeRequestId={activeRequestId}
                      {...actions}
                    />
                  ))}
                </SortableContext>
              )}
            </>
          )}
        </div>
      </section>

      <DragOverlay>
        {activeRequest && (
          <DragOverlayRequest request={activeRequest} />
        )}
        {activeCollection && (
          <DragOverlayCollection collection={activeCollection} />
        )}
        {activeFolder && (
          <DragOverlayFolder folder={activeFolder} />
        )}
      </DragOverlay>
    </DndContext>
  )
}

type CollectionBranchProps = BranchActions & {
  collection: ApiClientCollection
  tree: TreeData
  filter: string
  collapsed: Set<string>
  activeRequestId: number | null
  onToggle: (id: string) => void
  onOpenCollection?: (collection: ApiClientCollection) => void
}

function CollectionBranch({
  collection,
  tree,
  filter,
  collapsed,
  activeRequestId,
  onToggle,
  onOpenCollection,
  onOpenVariables,
  onCreateFolder,
  onCreateRequest,
  onOpenRequest,
  onRenameCollection,
  onRenameFolder,
  onDeleteCollection,
  onDeleteFolder,
  onDuplicateRequest,
  onDeleteRequest,
}: CollectionBranchProps) {
  const id = `collection:${collection.id}`
  const isCollapsed = !filter && collapsed.has(id)
  const folders = tree.foldersByParent.get(id) ?? []
  const requests = tree.requestsByFolder.get(id) ?? []
  const sortableId = `col-${collection.id}`
  const containerId = id

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    data: {
      type: 'collection',
      id: collection.id,
      containerId: 'root',
    } satisfies DragItem,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  const actions: BranchActions = {
    activeRequestId,
    onCreateFolder,
    onCreateRequest,
    onOpenRequest,
    onRenameCollection,
    onRenameFolder,
    onDeleteCollection,
    onDeleteFolder,
    onDuplicateRequest,
    onDeleteRequest,
  }

  return (
    <div ref={setNodeRef} style={style} role="treeitem" aria-expanded={!isCollapsed}>
      <div
        className="group flex min-w-0 cursor-grab items-center gap-1 rounded-lg border border-transparent px-1 py-1 hover:bg-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <ToggleButton
          collapsed={isCollapsed}
          label={collection.name}
          onClick={() => onToggle(id)}
        />
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-semibold"
          onClick={() => (onOpenCollection ? onOpenCollection(collection) : onToggle(id))}
        >
          {collection.name}
        </button>
        <span onPointerDown={(e) => e.stopPropagation()}>
          <TreeMenu label={`Ações de ${collection.name}`}>
            <TreeMenuAction icon={LuFilePlus2} onClick={() => onCreateRequest(collection.id, null)}>
              Novo request
            </TreeMenuAction>
            <TreeMenuAction icon={LuFolderPlus} onClick={() => onCreateFolder(collection.id, null)}>
              Nova pasta
            </TreeMenuAction>
            {onOpenVariables && (
              <>
                <TreeMenuDivider />
                <TreeMenuAction icon={LuBraces} onClick={() => onOpenVariables(collection)}>
                  Variáveis
                </TreeMenuAction>
              </>
            )}
            <TreeMenuDivider />
            <TreeMenuAction icon={LuPencil} onClick={() => onRenameCollection(collection)}>
              Renomear
            </TreeMenuAction>
            <TreeMenuAction
              icon={LuTrash2}
              destructive
              onClick={() => onDeleteCollection(collection)}
            >
              Excluir
            </TreeMenuAction>
          </TreeMenu>
        </span>
      </div>
      {!isCollapsed && (
        <div className="ml-4 pl-2" role="group">
          <SortableContext
            items={[
              ...folders.map((f) => `fol-${f.id}`),
              ...requests.map((r) => `req-${r.id}`),
            ]}
            strategy={verticalListSortingStrategy}
          >
            {folders.map((folder) => (
              <SortableFolderBranch
                key={folder.id}
                folder={folder}
                tree={tree}
                filter={filter}
                collapsed={collapsed}
                onToggle={onToggle}
                {...actions}
              />
            ))}
            {requests.map((request) => (
              <SortableRequestLeaf
                key={request.id}
                request={request}
                filter={filter}
                containerId={containerId}
                {...actions}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  )
}

type FolderBranchProps = BranchActions & {
  folder: ApiClientFolder
  tree: TreeData
  filter: string
  collapsed: Set<string>
  onToggle: (id: string) => void
}

function SortableFolderBranch(props: FolderBranchProps) {
  const id = `folder:${props.folder.id}`
  const sortableId = `fol-${props.folder.id}`

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    data: {
      type: 'folder',
      id: props.folder.id,
      collectionId: props.folder.collectionId,
      folderId: props.folder.parentId,
      containerId: props.folder.parentId
        ? `folder:${props.folder.parentId}`
        : `collection:${props.folder.collectionId}`,
    } satisfies DragItem,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  const visible = matchesFolder(props.folder, props.tree, props.filter)
  if (!visible) return null
  const isCollapsed = !props.filter && props.collapsed.has(id)
  const folders = props.tree.foldersByParent.get(id) ?? []
  const requests = props.tree.requestsByFolder.get(id) ?? []
  const containerId = id
  const nextActions: BranchActions = {
    onCreateFolder: props.onCreateFolder,
    onCreateRequest: props.onCreateRequest,
    onRenameFolder: props.onRenameFolder,
    onDeleteFolder: props.onDeleteFolder,
    activeRequestId: props.activeRequestId,
    onOpenRequest: props.onOpenRequest,
    onRenameCollection: props.onRenameCollection,
    onDeleteCollection: props.onDeleteCollection,
    onDuplicateRequest: props.onDuplicateRequest,
    onDeleteRequest: props.onDeleteRequest,
  }

  return (
    <div ref={setNodeRef} style={style} role="treeitem" aria-expanded={!isCollapsed}>
      <div
        className="group flex h-8 min-w-0 cursor-grab items-center gap-1 rounded-lg px-1 hover:bg-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <ToggleButton
          collapsed={isCollapsed}
          label={props.folder.name}
          small
          onClick={() => props.onToggle(id)}
        />
        <LuFolder className="size-3.5 shrink-0 text-muted-foreground" />
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm"
          onClick={() => props.onToggle(id)}
        >
          {props.folder.name}
        </button>
        <span onPointerDown={(e) => e.stopPropagation()} className="flex items-center">
          <button
            type="button"
            aria-label={`Novo request em ${props.folder.name}`}
            title="Novo request"
            className="grid size-6 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            onClick={() => props.onCreateRequest(props.folder.collectionId, props.folder.id)}
          >
            <LuFilePlus2 className="size-3.5" />
          </button>
          <TreeMenu label={`Ações de ${props.folder.name}`}>
            <TreeMenuAction
              icon={LuFilePlus2}
              onClick={() => props.onCreateRequest(props.folder.collectionId, props.folder.id)}
            >
              Novo request
            </TreeMenuAction>
            <TreeMenuAction
              icon={LuFolderPlus}
              onClick={() => props.onCreateFolder(props.folder.collectionId, props.folder.id)}
            >
              Nova subpasta
            </TreeMenuAction>
            <TreeMenuDivider />
            <TreeMenuAction icon={LuPencil} onClick={() => props.onRenameFolder(props.folder)}>
              Renomear
            </TreeMenuAction>
            <TreeMenuAction icon={LuTrash2} destructive onClick={() => props.onDeleteFolder(props.folder)}>
              Excluir
            </TreeMenuAction>
          </TreeMenu>
        </span>
      </div>
      {!isCollapsed && (
        <div className="ml-3 pl-2" role="group">
          <SortableContext
            items={[
              ...folders.map((f) => `fol-${f.id}`),
              ...requests.map((r) => `req-${r.id}`),
            ]}
            strategy={verticalListSortingStrategy}
          >
            {folders.map((child) => (
              <SortableFolderBranch
                key={child.id}
                folder={child}
                tree={props.tree}
                filter={props.filter}
                collapsed={props.collapsed}
                onToggle={props.onToggle}
                {...nextActions}
              />
            ))}
            {requests.map((request) => (
              <SortableRequestLeaf
                key={request.id}
                request={request}
                filter={props.filter}
                containerId={containerId}
                {...nextActions}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  )
}

function ToggleButton({
  collapsed,
  label,
  small = false,
  onClick,
}: {
  collapsed: boolean
  label: string
  small?: boolean
  onClick: () => void
}) {
  const Icon = collapsed ? LuChevronRight : LuChevronDown
  return (
    <button
      type="button"
      aria-label={collapsed ? `Expandir ${label}` : `Recolher ${label}`}
      className={cn(
        'grid shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground',
        small ? 'size-6' : 'size-7',
      )}
      onClick={onClick}
    >
      <Icon className={small ? 'size-3.5' : 'size-4'} />
    </button>
  )
}

type SortableRequestLeafProps = Pick<
  BranchActions,
  'activeRequestId' | 'onOpenRequest' | 'onDuplicateRequest' | 'onDeleteRequest'
> & {
  request: ApiClientRequestSummary
  filter: string
  containerId: string
}

function SortableRequestLeaf({
  request,
  filter,
  containerId,
  activeRequestId,
  onOpenRequest,
  onDuplicateRequest,
  onDeleteRequest,
}: SortableRequestLeafProps) {
  const sortableId = `req-${request.id}`

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    data: {
      type: 'request',
      id: request.id,
      collectionId: request.collectionId,
      folderId: request.folderId,
      containerId,
    } satisfies DragItem,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  if (filter && !request.name.toLocaleLowerCase('pt-BR').includes(filter)) return null
  const active = request.id === activeRequestId

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex h-8 min-w-0 cursor-grab items-center gap-1 rounded-lg px-1 hover:bg-muted active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-muted',
          active && 'bg-primary-soft text-highlight hover:bg-primary-soft',
        )}
        onClick={() => onOpenRequest(request.id)}
      >
        <span
          className={cn(
            'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold',
            methodTone(request.method),
          )}
        >
          {request.method}
        </span>
        <span className="truncate">{request.name}</span>
      </button>
      <span onPointerDown={(e) => e.stopPropagation()}>
        <TreeMenu label={`Ações de ${request.name}`}>
          <TreeMenuAction icon={LuCopy} onClick={() => onDuplicateRequest(request)}>
            Duplicar
          </TreeMenuAction>
          <TreeMenuDivider />
          <TreeMenuAction icon={LuTrash2} destructive onClick={() => onDeleteRequest(request)}>
            Excluir
          </TreeMenuAction>
        </TreeMenu>
      </span>
    </div>
  )
}

function DragOverlayRequest({ request }: { request: ApiClientRequestSummary }) {
  return (
    <div className="flex h-8 cursor-grabbing items-center gap-2 rounded-lg border bg-card px-3 shadow-lg opacity-90">
      <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold', methodTone(request.method))}>
        {request.method}
      </span>
      <span className="truncate text-sm">{request.name}</span>
    </div>
  )
}

function DragOverlayCollection({ collection }: { collection: ApiClientCollection }) {
  return (
    <div className="flex h-9 cursor-grabbing items-center gap-2 rounded-lg border bg-card px-3 shadow-lg opacity-90">
      <span className="truncate text-sm font-semibold">{collection.name}</span>
    </div>
  )
}

function DragOverlayFolder({ folder }: { folder: ApiClientFolder }) {
  return (
    <div className="flex h-8 cursor-grabbing items-center gap-2 rounded-lg border bg-card px-3 shadow-lg opacity-90">
      <LuFolder className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm">{folder.name}</span>
    </div>
  )
}

function TreeMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="relative shrink-0">
      <summary
        aria-label={label}
        title={label}
        className="grid size-7 list-none place-items-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-card hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [&::-webkit-details-marker]:hidden"
      >
        <LuEllipsis className="size-4" />
      </summary>
      <div
        role="menu"
        className="absolute top-8 right-0 z-30 w-44 rounded-lg border bg-popover p-1 shadow-lg"
      >
        {children}
      </div>
    </details>
  )
}

function TreeMenuAction({
  icon: Icon,
  destructive = false,
  children,
  onClick,
}: {
  icon: IconType
  destructive?: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-muted',
        destructive && 'text-destructive hover:text-destructive',
      )}
      onClick={onClick}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  )
}

function TreeMenuDivider() {
  return <hr className="my-1" />
}

function EmptyCollections({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid min-h-52 place-items-center gap-3 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
      <LuFolderTree className="size-6 text-highlight" />
      <p>Crie uma coleção para organizar os endpoints do seu projeto.</p>
      <button
        type="button"
        className="inline-flex h-8 items-center gap-2 rounded-lg border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        onClick={onCreate}
      >
        <LuPlus className="size-3.5" />
        Criar coleção
      </button>
    </div>
  )
}

function EmptySearch({ filter }: { filter: string }) {
  return (
    <div className="grid min-h-44 place-items-center gap-2 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
      <LuSearch className="size-5" />
      <p>Nenhum item encontrado para "{filter.trim()}".</p>
    </div>
  )
}

function groupFolders(folders: ApiClientFolder[]) {
  const grouped = new Map<string, ApiClientFolder[]>()
  for (const folder of folders) {
    const key =
      folder.parentId === null ? `collection:${folder.collectionId}` : `folder:${folder.parentId}`
    grouped.set(key, [...(grouped.get(key) ?? []), folder])
  }
  return grouped
}

function groupRequests(requests: ApiClientRequestSummary[]) {
  const grouped = new Map<string, ApiClientRequestSummary[]>()
  for (const request of requests) {
    const key =
      request.collectionId === null
        ? 'drafts'
        : request.folderId === null
          ? `collection:${request.collectionId}`
          : `folder:${request.folderId}`
    grouped.set(key, [...(grouped.get(key) ?? []), request])
  }
  return grouped
}

function matchesCollection(
  collection: ApiClientCollection,
  tree: TreeData,
  filter: string,
): boolean {
  if (
    !filter ||
    collection.name.toLocaleLowerCase('pt-BR').includes(filter) ||
    collection.description.toLocaleLowerCase('pt-BR').includes(filter)
  )
    return true
  return (
    collectionRequests(collection.id, tree.requestsByFolder).some((request) =>
      request.name.toLocaleLowerCase('pt-BR').includes(filter),
    ) ||
    (tree.foldersByParent.get(`collection:${collection.id}`) ?? []).some((folder) =>
      matchesFolder(folder, tree, filter),
    )
  )
}

function matchesFolder(folder: ApiClientFolder, tree: TreeData, filter: string): boolean {
  if (!filter || folder.name.toLocaleLowerCase('pt-BR').includes(filter)) return true
  const requests = tree.requestsByFolder.get(`folder:${folder.id}`) ?? []
  const folders = tree.foldersByParent.get(`folder:${folder.id}`) ?? []
  return (
    requests.some((request) => request.name.toLocaleLowerCase('pt-BR').includes(filter)) ||
    folders.some((child) => matchesFolder(child, tree, filter))
  )
}

function collectionRequests(
  collectionId: number,
  requestsByFolder: Map<string, ApiClientRequestSummary[]>,
) {
  return Array.from(requestsByFolder.values())
    .flat()
    .filter((request) => request.collectionId === collectionId)
}

function methodTone(method: ApiClientRequestSummary['method']) {
  if (method === 'GET') return 'bg-success/15 text-success'
  if (method === 'POST') return 'bg-primary-soft text-highlight'
  if (method === 'PUT' || method === 'PATCH') return 'bg-warning/15 text-warning'
  return 'bg-destructive/15 text-destructive'
}
