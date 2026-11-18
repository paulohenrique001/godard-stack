import { LuCheck, LuChevronDown } from 'react-icons/lu'
import { Select } from 'radix-ui'
import { SgbdIcon } from '@/features/sgbd/sgbd-icon'
import { DRIVER_KINDS, DRIVERS, type SgbdKind } from '@/features/sgbd/sgbd-drivers'

type KindSelectProps = {
  id: string
  value: SgbdKind
  disabled?: boolean
  onChange: (kind: SgbdKind) => void
}

export function KindSelect({ id, value, disabled = false, onChange }: KindSelectProps) {
  return (
    <Select.Root value={value} disabled={disabled} onValueChange={(kind) => onChange(kind as SgbdKind)}>
      <Select.Trigger
        id={id}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:bg-muted/50 disabled:opacity-70"
      >
        <span className="flex min-w-0 items-center gap-2">
          <SgbdIcon kind={value} className="size-4" />
          <Select.Value>{DRIVERS[value].label}</Select.Value>
        </span>
        <Select.Icon>
          <LuChevronDown className="size-4 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 w-(--radix-select-trigger-width) overflow-hidden rounded-lg border bg-popover p-1 shadow-md"
        >
          <Select.Viewport>
            {DRIVER_KINDS.map((kind) => (
              <Select.Item
                key={kind}
                value={kind}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-highlighted:bg-muted"
              >
                <SgbdIcon kind={kind} className="size-4" />
                <Select.ItemText>{DRIVERS[kind].label}</Select.ItemText>
                <Select.ItemIndicator className="ml-auto">
                  <LuCheck className="size-4 text-highlight" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
