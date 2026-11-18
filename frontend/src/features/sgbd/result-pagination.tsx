import { LuCheck, LuChevronDown, LuChevronFirst, LuChevronLast, LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { Select } from 'radix-ui'
import { ITEM_CLASS } from '@/features/sgbd/schema-select'
import type { ResultTable } from '@/features/sgbd/sgbd-api'
import { cn } from '@/lib/utils'

const PAGE_SIZES = [10, 100, 250, 500, 1000]
const MIN_ROWS_TO_PAGINATE = 10
const NAV_BUTTON_CLASS =
  'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40'

export const visibleRows = (table: ResultTable, pageSize: number) =>
  table.paged ? table.rows : table.rows.slice(table.offset, table.offset + pageSize)

export function isPaginated(table: ResultTable, pageSize: number) {
  const shown = visibleRows(table, pageSize).length
  return (table.total ?? table.offset + shown + 1) > MIN_ROWS_TO_PAGINATE
}

type ResultPaginationProps = {
  table: ResultTable
  pageSize: number
  loading: boolean
  className?: string
  onOffsetChange: (offset: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function ResultPagination({
  table,
  pageSize,
  loading,
  className,
  onOffsetChange,
  onPageSizeChange,
}: ResultPaginationProps) {
  const { offset, total } = table
  const shown = visibleRows(table, pageSize).length
  const lastRow = offset + shown
  const hasNext = total === null ? true : lastRow < total
  const range = shown === 0 ? '0' : `${offset + 1}-${lastRow}`

  return (
    <nav
      aria-label="Paginação do resultado"
      className={cn(
        'absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border bg-popover p-1 text-xs text-muted-foreground shadow-md',
        className,
      )}
    >
      <button
        type="button"
        aria-label="Primeira página"
        disabled={loading || offset === 0}
        className={NAV_BUTTON_CLASS}
        onClick={() => onOffsetChange(0)}
      >
        <LuChevronFirst className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Página anterior"
        disabled={loading || offset === 0}
        className={NAV_BUTTON_CLASS}
        onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
      >
        <LuChevronLeft className="size-4" />
      </button>
      <Select.Root
        value={String(pageSize)}
        disabled={loading}
        onValueChange={(size) => onPageSizeChange(Number(size))}
      >
        <Select.Trigger
          aria-label="Tamanho da página"
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-medium whitespace-nowrap text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Select.Value>{range}</Select.Value>
          <Select.Icon>
            <LuChevronDown className="size-3" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            side="top"
            sideOffset={8}
            className="z-50 min-w-40 overflow-hidden rounded-lg border bg-popover p-1 shadow-md"
          >
            <Select.Viewport>
              <Select.Group>
                <Select.Label className="px-2.5 py-1.5 text-xs text-muted-foreground">Tamanho da página</Select.Label>
                {PAGE_SIZES.map((size) => (
                  <Select.Item key={size} value={String(size)} className={cn(ITEM_CLASS, 'justify-between')}>
                    <Select.ItemText>{size}</Select.ItemText>
                    <Select.ItemIndicator>
                      <LuCheck className="size-3" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Group>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <span className="px-1 whitespace-nowrap">de {total ?? `${lastRow}+`}</span>
      <button
        type="button"
        aria-label="Próxima página"
        disabled={loading || !hasNext}
        className={NAV_BUTTON_CLASS}
        onClick={() => onOffsetChange(lastRow)}
      >
        <LuChevronRight className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Última página"
        disabled={loading || total === null || !hasNext}
        className={NAV_BUTTON_CLASS}
        onClick={() => onOffsetChange(Math.floor(((total ?? 1) - 1) / pageSize) * pageSize)}
      >
        <LuChevronLast className="size-4" />
      </button>
    </nav>
  )
}
