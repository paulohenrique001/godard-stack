import { useEffect, useState } from 'react'
import { LuChevronDown, LuCircleDashed, LuDatabase } from 'react-icons/lu'
import { Select } from 'radix-ui'
import { fetchSchemas, refreshSchemas, type SchemaRow, type SgbdConnection } from '@/features/sgbd/sgbd-api'
import { DRIVERS } from '@/features/sgbd/sgbd-drivers'

const NO_SCHEMA = 'sem-schema'
export const ITEM_CLASS =
  'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs outline-none data-highlighted:bg-muted data-[state=checked]:text-highlight'

type SchemaSelectProps = {
  connection: SgbdConnection
  value: string | null
  onChange: (schema: string | null) => void
}

export function SchemaSelect({ connection, value, onChange }: SchemaSelectProps) {
  const [schemas, setSchemas] = useState<SchemaRow[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const cached = await fetchSchemas(connection)
        if (cancelled) return
        setSchemas(cached.rows)
        if (!cached.cached) return
        const fresh = await refreshSchemas(connection)
        if (!cancelled) setSchemas(fresh.rows)
      } catch {
        // O seletor permanece utilizável com a lista já carregada, quando houver.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [connection])

  const noSchemaLabel = DRIVERS[connection.kind].noSchemaLabel
  const visibleSchemas = schemas.filter(
    (schema) => (connection.showSystemSchemas || !schema.system)
      && (connection.showAllSchemas || connection.selectedSchemas.includes(schema.name)),
  )
  const schemaNames = visibleSchemas.map((schema) => schema.name)
  const options = value === null || schemaNames.includes(value) ? schemaNames : [value, ...schemaNames]

  return (
    <Select.Root
      value={value ?? NO_SCHEMA}
      onValueChange={(schema) => onChange(schema === NO_SCHEMA ? null : schema)}
    >
      <Select.Trigger
        aria-label="Schema do console"
        className="absolute top-3 right-4 z-10 inline-flex max-w-52 items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-highlight opacity-60 shadow-sm outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {value === null ? <LuCircleDashed className="size-3" /> : <LuDatabase className="size-3" />}
        <span className="truncate">
          <Select.Value>{value ?? noSchemaLabel}</Select.Value>
        </span>
        <Select.Icon>
          <LuChevronDown className="size-3" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          align="end"
          sideOffset={4}
          className="z-50 max-h-64 min-w-40 overflow-hidden rounded-lg border bg-popover p-1 shadow-md"
        >
          <Select.Viewport>
            <Select.Item value={NO_SCHEMA} className={ITEM_CLASS}>
              <LuCircleDashed className="size-3 shrink-0" />
              <Select.ItemText>{noSchemaLabel}</Select.ItemText>
            </Select.Item>
            {options.map((schema) => (
              <Select.Item key={schema} value={schema} className={ITEM_CLASS}>
                <LuDatabase className="size-3 shrink-0" />
                <Select.ItemText>{schema}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
