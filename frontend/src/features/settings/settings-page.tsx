import type { IconType } from 'react-icons'
import { LuChevronDown, LuMonitorCog, LuMoon, LuSun } from 'react-icons/lu'
import { Select } from 'radix-ui'
import { useSettings, type RefreshInterval } from '@/features/settings/settings-provider'
import { useTheme, type Theme } from '@/features/theme/theme-provider'
import { cn } from '@/lib/utils'

const INTERVAL_OPTIONS: Array<{ value: RefreshInterval; label: string; description: string }> = [
  { value: 0, label: 'Desativada', description: 'Atualize manualmente quando precisar.' },
  { value: 30_000, label: 'A cada 30 segundos', description: 'Resposta mais rápida, com mais consultas locais.' },
  { value: 60_000, label: 'A cada 1 minuto', description: 'Equilíbrio recomendado para desenvolvimento.' },
  { value: 120_000, label: 'A cada 2 minutos', description: 'Menos atividade em segundo plano.' },
]

function ThemeChoice({ value, label, icon: Icon, selected, onClick }: { value: Theme; label: string; icon: IconType; selected: boolean; onClick: (value: Theme) => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'border-highlight bg-primary-soft text-highlight',
      )}
      onClick={() => onClick(value)}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { refreshInterval, setRefreshInterval } = useSettings()
  const selectedInterval = INTERVAL_OPTIONS.find((option) => option.value === refreshInterval)!

  return (
    <div className="animate-in fade-in p-6 duration-200">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><LuMonitorCog className="size-5 text-highlight" />Configurações</h2>
        <p className="mt-1 text-sm text-muted-foreground">Preferências locais deste navegador.</p>
      </header>
      <div className="mt-6 max-w-2xl space-y-5">
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-semibold">Aparência</h3>
          <p className="mt-1 text-sm text-muted-foreground">Escolha o tema usado pela interface.</p>
          <div className="mt-4 flex max-w-sm gap-2">
            <ThemeChoice value="light" label="Claro" icon={LuSun} selected={theme === 'light'} onClick={setTheme} />
            <ThemeChoice value="dark" label="Escuro" icon={LuMoon} selected={theme === 'dark'} onClick={setTheme} />
          </div>
        </section>
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-semibold">Atualização automática</h3>
          <p className="mt-1 text-sm text-muted-foreground">Controla a atualização da dashboard, Docker, SGBD e dados da máquina.</p>
          <div className="mt-4 max-w-sm">
            <Select.Root value={String(refreshInterval)} onValueChange={(value) => setRefreshInterval(Number(value) as RefreshInterval)}>
              <Select.Trigger aria-label="Intervalo de atualização automática" className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                <Select.Value />
                <Select.Icon><LuChevronDown className="size-4 text-muted-foreground" /></Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content position="popper" align="start" sideOffset={4} className="z-50 min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
                  <Select.Viewport>
                    {INTERVAL_OPTIONS.map((option) => (
                      <Select.Item key={option.value} value={String(option.value)} className="cursor-pointer rounded-md px-2.5 py-2 text-sm outline-none data-highlighted:bg-muted">
                        <Select.ItemText>{option.label}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
            <p className="mt-2 text-xs text-muted-foreground">{selectedInterval.description}</p>
          </div>
        </section>
      </div>
    </div>
  )
}
