import type { ReactNode } from 'react'
import { LuActivity, LuBell, LuCheckCheck, LuCirclePlay, LuLink, LuLoaderCircle, LuRefreshCw, LuServer, LuSquareTerminal } from 'react-icons/lu'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { ActivityLog } from '@/features/dashboard/activity-api'
import type { useNotifications } from '@/features/notifications/use-notifications'
import { cn } from '@/lib/utils'

const ACTIVITY_ICONS = {
  container: LuCirclePlay,
  connection: LuLink,
  console: LuSquareTerminal,
  command: LuSquareTerminal,
  system: LuServer,
}

function notificationTime(createdAt: string) {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

type NotificationsPopupProps = {
  open: boolean
  notifications: ReturnType<typeof useNotifications>
  children: ReactNode
  onOpenChange: (open: boolean) => void
  onOpenActivity: () => void
}

export function NotificationsPopup({ open, notifications, children, onOpenChange, onOpenActivity }: NotificationsPopupProps) {
  const { items, loading, unavailable, unreadCount, refresh, markAllRead } = notifications

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content side="bottom" align="end" sideOffset={8} className="z-50 flex w-[min(28rem,calc(100vw-2rem))] max-h-[min(34rem,calc(100vh-6rem))] flex-col overflow-hidden rounded-xl border bg-popover shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
          <header className="border-b px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold"><LuBell className="size-5 text-highlight" />Notificações</h2>
            <p className="mt-1 text-sm text-muted-foreground">{unreadCount === 0 ? 'Nenhuma notificação não lida.' : `${unreadCount} não ${unreadCount === 1 ? 'lida' : 'lidas'}.`}</p>
          </header>
          <div className="min-h-48 flex-1 overflow-y-auto px-5">
            {loading && <div className="grid min-h-48 place-items-center"><LuLoaderCircle className="size-5 animate-spin text-highlight" /></div>}
            {!loading && unavailable && <p role="alert" className="pt-4 text-sm text-destructive">Não foi possível atualizar as notificações. O histórico exibido pode estar desatualizado.</p>}
            {!loading && items.length === 0 && <div className="grid min-h-48 place-items-center text-center text-sm text-muted-foreground"><span><LuActivity className="mx-auto mb-2 size-6" />Nenhuma atividade recente</span></div>}
            {!loading && items.map((item) => <NotificationItem key={item.id} item={item} />)}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => void refresh()}><LuRefreshCw />Atualizar</Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={unreadCount === 0} onClick={markAllRead}><LuCheckCheck />Marcar como lidas</Button>
              <Button size="sm" onClick={() => { markAllRead(); onOpenActivity() }}>Ver atividades</Button>
            </div>
          </footer>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

function NotificationItem({ item }: { item: ActivityLog }) {
  const Icon = ACTIVITY_ICONS[item.kind]
  return (
    <div className="flex items-start gap-3 border-b py-3 last:border-b-0">
      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full', item.tone === 'success' && 'bg-success/15 text-success', item.tone === 'primary' && 'bg-primary-soft text-highlight', item.tone === 'muted' && 'bg-muted text-muted-foreground', item.tone === 'warning' && 'bg-primary-soft text-warning')}><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm">{item.message}</span><time className="mt-1 block text-xs tabular-nums text-muted-foreground">{notificationTime(item.createdAt)}</time></span>
    </div>
  )
}
