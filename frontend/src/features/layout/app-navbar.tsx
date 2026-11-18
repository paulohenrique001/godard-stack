import { LuBell, LuSettings } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NotificationsPopup } from '@/features/notifications/notifications-popup'
import type { useNotifications } from '@/features/notifications/use-notifications'
import { UserAvatar } from '@/features/profile/user-avatar'
import type { SearchItem } from '@/features/search/search-catalog'
import { SearchBar } from '@/features/search/search-bar'
import { cn } from '@/lib/utils'

const ICON_BUTTON = 'relative rounded-lg text-muted-foreground transition-colors hover:text-foreground'

type AppNavbarProps = {
  title: string
  userName: string
  avatarSeed: string | null
  profileActive: boolean
  searchItems: SearchItem[]
  onOpenProfile: () => void
  notifications: ReturnType<typeof useNotifications>
  notificationsOpen: boolean
  onNotificationsOpenChange: (open: boolean) => void
  onOpenActivity: () => void
  onOpenSettings: () => void
  onSearchClosed: () => void
}

export function AppNavbar({
  title,
  userName,
  avatarSeed,
  profileActive,
  searchItems,
  onOpenProfile,
  notifications,
  notificationsOpen,
  onNotificationsOpenChange,
  onOpenActivity,
  onOpenSettings,
  onSearchClosed,
}: AppNavbarProps) {
  return (
    <header className="grid h-16 shrink-0 grid-cols-[1fr_minmax(0,28rem)_1fr] items-center gap-4 border-b px-6">
      <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
      <SearchBar items={searchItems} onClosed={onSearchClosed} />
      <div className="flex items-center justify-end gap-1">
        <NotificationsPopup
          open={notificationsOpen}
          notifications={notifications}
          onOpenChange={onNotificationsOpenChange}
          onOpenActivity={onOpenActivity}
        >
          <Button variant="ghost" size="icon" className={ICON_BUTTON} aria-label="Notificações">
            <LuBell />
            {notifications.unreadCount > 0 && <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-highlight text-[9px] font-bold text-primary-soft">{notifications.unreadCount > 9 ? '9+' : notifications.unreadCount}</span>}
          </Button>
        </NotificationsPopup>
        <Button variant="ghost" size="icon" className={ICON_BUTTON} aria-label="Configurações" onClick={onOpenSettings}>
          <LuSettings />
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Perfil"
              aria-current={profileActive ? 'page' : undefined}
              className={cn(
                'ml-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring',
                profileActive && 'ring-2 ring-highlight',
              )}
              onClick={onOpenProfile}
            >
              <UserAvatar name={userName} seed={avatarSeed} className="size-9 text-sm" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={6}>
            {userName}
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
