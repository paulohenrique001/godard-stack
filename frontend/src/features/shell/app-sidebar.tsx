import type { Page, UserProfile } from '../../api'
import { cn } from '../../shared/lib/cn'
import { AppLogo } from '../brand/app-logo'
import { UserAvatar } from '../profile/user-avatar'
import { SIDEBAR_PAGES } from './navigation'

type AppSidebarProps = {
  page: Page
  user: UserProfile
  onNavigate: (page: Page) => void
}

export function AppSidebar({ page, user, onNavigate }: AppSidebarProps) {
  const onSettings = page === 'settings'
  return (
    <nav
      className="flex w-20 shrink-0 flex-col items-center border-r py-4"
      aria-label="Navegação principal"
    >
      <button
        type="button"
        aria-label="Ir para Visão geral"
        className="flex size-14 items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onNavigate('dashboard')}
      >
        <AppLogo className="size-10" showHat={false} />
      </button>
      <ul className="flex flex-1 flex-col justify-center gap-2 self-stretch">
        {SIDEBAR_PAGES.map((item) => {
          const Icon = item.icon
          const active = page === item.id
          return (
            <li key={item.id} className="relative flex justify-center">
              <button
                type="button"
                aria-label={item.title}
                aria-current={active ? 'page' : undefined}
                title={item.title}
                className={cn(
                  'size-12 rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  active &&
                    'bg-primary-soft text-highlight hover:bg-primary-soft hover:text-highlight',
                )}
                onClick={() => onNavigate(item.id)}
              >
                <Icon className="mx-auto size-7" />
              </button>
              {active && (
                <span className="absolute inset-y-3 right-0 w-0.5 rounded-l-full bg-highlight" />
              )}
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        aria-label="Perfil e configurações"
        aria-current={onSettings ? 'page' : undefined}
        title={user.name}
        className={cn(
          'rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring',
          onSettings && 'ring-2 ring-highlight',
        )}
        onClick={() => onNavigate('settings')}
      >
        <UserAvatar name={user.name} seed={user.avatarSeed} className="size-9 text-sm" />
      </button>
    </nav>
  )
}
