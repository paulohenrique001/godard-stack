import { LuMonitorCog, LuMoon, LuSun } from 'react-icons/lu'
import type { RuntimeStatus, Theme, UserPreferences } from '../../api'
import { cn } from '../../shared/lib/cn'
import { UpdatePanel } from '../release/update-panel'

type SettingsPageProps = {
  runtime: RuntimeStatus
  preferences: UserPreferences
  onSave: (preferences: UserPreferences) => Promise<boolean>
  onApplyTheme: (theme: Theme) => void
  resolveTheme: (theme: UserPreferences['theme']) => Theme
}

export function SettingsPage({
  runtime,
  preferences,
  onSave,
  onApplyTheme,
  resolveTheme,
}: SettingsPageProps) {
  const update = async (next: UserPreferences, apply?: () => void, revert?: () => void) => {
    apply?.()
    const saved = await onSave(next)
    if (!saved) revert?.()
  }

  return (
    <div className="animate-in fade-in p-6 duration-200">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <LuMonitorCog className="size-5 text-highlight" />
            Configurações
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Preferências locais desta instalação.
          </p>
        </div>
        <ThemeSelector
          selectedTheme={preferences.theme}
          onSelect={(theme) =>
            void update(
              { ...preferences, theme },
              () => onApplyTheme(theme),
              () => onApplyTheme(resolveTheme(preferences.theme)),
            )
          }
        />
      </header>
      <div className="mt-6 max-w-2xl">
        <UpdatePanel runtime={runtime} className="h-full" />
      </div>
    </div>
  )
}

function ThemeSelector({
  selectedTheme,
  onSelect,
}: {
  selectedTheme: UserPreferences['theme']
  onSelect: (theme: Theme) => void
}) {
  return (
    <div className="w-full shrink-0 rounded-xl border bg-card p-1 shadow-sm md:w-72">
      <div role="group" aria-label="Tema da interface" className="grid grid-cols-2 gap-1">
        <ThemeChoice
          value="light"
          label="Claro"
          icon={LuSun}
          selected={selectedTheme === 'light'}
          onClick={onSelect}
        />
        <ThemeChoice
          value="dark"
          label="Escuro"
          icon={LuMoon}
          selected={selectedTheme === 'dark'}
          onClick={onSelect}
        />
      </div>
    </div>
  )
}

function ThemeChoice({
  value,
  label,
  icon: Icon,
  selected,
  onClick,
}: {
  value: Theme
  label: string
  icon: typeof LuSun
  selected: boolean
  onClick: (value: Theme) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'flex h-9 min-w-0 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'bg-primary-soft text-highlight shadow-sm',
      )}
      onClick={() => onClick(value)}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}
