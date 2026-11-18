import { Fragment, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import {
  LuActivity,
  LuBell,
  LuCheckCheck,
  LuMaximize2,
  LuMinus,
  LuRefreshCw,
  LuSearch,
  LuSettings,
  LuX,
} from 'react-icons/lu'
import type { Activity } from '../../api'
import { useModalDialog } from '../accessibility/use-modal-dialog'
import { activityIcon, activityToneClass, formatActivityTime } from '../../shared/lib/format'
import { cn } from '../../shared/lib/cn'
import { runDesktopWindowAction } from './window-actions'

type AppNavbarProps = {
  title: string
  titleRef: RefObject<HTMLHeadingElement | null>
  activities: Activity[]
  unreadCount: number
  notificationsOpen: boolean
  onNotificationsOpenChange: (open: boolean) => void
  onMarkNotificationsRead: () => void
  onOpenActivity: () => void
  onOpenSettings: () => void
  onOpenSearch: () => void
  onRefresh: () => void
  onRequestExit: () => void
}

export function AppNavbar({
  title,
  titleRef,
  activities,
  unreadCount,
  notificationsOpen,
  onNotificationsOpenChange,
  onMarkNotificationsRead,
  onOpenActivity,
  onOpenSettings,
  onOpenSearch,
  onRefresh,
  onRequestExit,
}: AppNavbarProps) {
  const startWindowDrag = (event: ReactMouseEvent<HTMLElement>) => {
    if (
      event.button !== 0 ||
      (event.target instanceof Element &&
        event.target.closest('button, input, select, textarea, a, [role="button"]'))
    ) {
      return
    }
    runDesktopWindowAction((appWindow) => appWindow.startDragging())
  }

  return (
    <header
      className="relative grid h-16 shrink-0 grid-cols-[1fr_minmax(0,28rem)_1fr] items-center gap-4 border-b px-6"
      onMouseDown={startWindowDrag}
    >
      <h1
        ref={titleRef}
        id="page-title"
        tabIndex={-1}
        className="truncate text-lg font-semibold tracking-tight outline-none"
      >
        {title}
      </h1>
      <button
        type="button"
        className="flex h-10 w-full items-center gap-2.5 rounded-xl border border-transparent bg-muted px-3.5 text-sm text-muted-foreground transition-colors outline-none hover:border-border focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={onOpenSearch}
      >
        <LuSearch className="size-4 shrink-0" />
        <span className="flex-1 text-left">Pesquisar</span>
        <kbd className="flex gap-1 font-sans text-[11px] font-medium">
          <span className="rounded-md border bg-background px-1.5 py-0.5">Ctrl</span>
          <span className="rounded-md border bg-background px-1.5 py-0.5">K</span>
        </kbd>
      </button>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          className="relative size-9 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Notificações"
          aria-haspopup="dialog"
          aria-expanded={notificationsOpen}
          aria-controls="notifications-popup"
          onClick={() => onNotificationsOpenChange(!notificationsOpen)}
        >
          <LuBell className="mx-auto size-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-highlight text-[9px] font-bold text-primary-soft">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className="size-9 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Configurações"
          onClick={onOpenSettings}
        >
          <LuSettings className="mx-auto size-4" />
        </button>
        <WindowControls onRequestExit={onRequestExit} />
      </div>
      {notificationsOpen && (
        <Fragment>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40"
            onMouseDown={() => onNotificationsOpenChange(false)}
          />
          <NotificationsPopup
            activities={activities}
            unreadCount={unreadCount}
            onClose={() => onNotificationsOpenChange(false)}
            onMarkRead={onMarkNotificationsRead}
            onOpenActivity={onOpenActivity}
            onRefresh={onRefresh}
          />
        </Fragment>
      )}
    </header>
  )
}

function WindowControls({ onRequestExit }: { onRequestExit: () => void }) {
  return (
    <div
      className="ml-2 flex items-center gap-1 border-l pl-2"
      role="group"
      aria-label="Controles da janela"
    >
      <button
        type="button"
        aria-label="Minimizar janela"
        title="Minimizar"
        className="size-9 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={() => runDesktopWindowAction((appWindow) => appWindow.minimize())}
      >
        <LuMinus className="mx-auto size-4" />
      </button>
      <button
        type="button"
        aria-label="Maximizar ou restaurar janela"
        title="Maximizar ou restaurar"
        className="size-9 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={() => runDesktopWindowAction((appWindow) => appWindow.toggleMaximize())}
      >
        <LuMaximize2 className="mx-auto size-4" />
      </button>
      <button
        type="button"
        aria-label="Fechar janela"
        title="Fechar"
        className="size-9 rounded-lg text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
        onClick={onRequestExit}
      >
        <LuX className="mx-auto size-4" />
      </button>
    </div>
  )
}

function NotificationsPopup({
  activities,
  unreadCount,
  onClose,
  onMarkRead,
  onOpenActivity,
  onRefresh,
}: {
  activities: Activity[]
  unreadCount: number
  onClose: () => void
  onMarkRead: () => void
  onOpenActivity: () => void
  onRefresh: () => void
}) {
  const dialogRef = useModalDialog(true, onClose)
  return (
    <section
      ref={dialogRef}
      id="notifications-popup"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-title"
      className="absolute top-[calc(100%+0.5rem)] right-6 z-50 flex w-[min(28rem,calc(100vw-2rem))] max-h-[min(34rem,calc(100vh-6rem))] flex-col overflow-hidden rounded-xl border bg-popover shadow-xl outline-none"
    >
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 id="notifications-title" className="flex items-center gap-2 font-semibold">
            <LuBell className="size-5 text-highlight" />
            Notificações
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount === 0
              ? 'Nenhuma notificação não lida.'
              : `${unreadCount} não ${unreadCount === 1 ? 'lida' : 'lidas'}.`}
          </p>
        </div>
        <button
          data-dialog-initial-focus
          type="button"
          aria-label="Fechar notificações"
          className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <LuX className="size-4" />
        </button>
      </header>
      <div className="min-h-48 flex-1 overflow-y-auto px-5">
        {activities.length === 0 && (
          <div className="grid min-h-48 place-items-center text-center text-sm text-muted-foreground">
            <span>
              <LuActivity className="mx-auto mb-2 size-6" />
              Nenhuma atividade recente
            </span>
          </div>
        )}
        {activities.slice(0, 8).map((item) => (
          <NotificationItem key={item.id} activity={item} />
        ))}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onRefresh}
        >
          <LuRefreshCw className="size-4" />
          Atualizar
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            disabled={unreadCount === 0}
            onClick={onMarkRead}
          >
            <LuCheckCheck className="size-4" />
            Marcar como lidas
          </button>
          <button
            type="button"
            className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={onOpenActivity}
          >
            Ver atividades
          </button>
        </div>
      </footer>
    </section>
  )
}

function NotificationItem({ activity }: { activity: Activity }) {
  const Icon = activityIcon(activity.kind)
  return (
    <div className="flex items-start gap-3 border-b py-3 last:border-b-0">
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-full',
          activityToneClass(activity.tone),
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{activity.message}</span>
        <time className="mt-1 block text-xs tabular-nums text-muted-foreground">
          {formatActivityTime(activity.createdAt, true)}
        </time>
      </span>
    </div>
  )
}
