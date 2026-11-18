import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AppLogo } from '@/features/brand/app-logo'
import { DEFAULT_PAGE, SIDEBAR_PAGES, type Page } from '@/features/layout/pages'
import { ThemeToggle } from '@/features/theme/theme-toggle'
import { cn } from '@/lib/utils'

type RailButtonProps = {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}

function RailButton({ label, active = false, onClick, children }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'size-12 rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            active && 'bg-primary-soft text-highlight hover:bg-primary-soft hover:text-highlight',
          )}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

type AppSidebarProps = {
  page: Page
  onNavigate: (page: Page) => void
}

export function AppSidebar({ page, onNavigate }: AppSidebarProps) {
  return (
    <nav className="flex w-20 shrink-0 flex-col items-center border-r py-4">
      <button
        type="button"
        aria-label="Ir para Visão geral"
        className="flex size-14 items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onNavigate(DEFAULT_PAGE)}
      >
        <AppLogo className="size-10" showHat={false} />
      </button>
      <ul className="flex flex-1 flex-col justify-center gap-2 self-stretch">
        {SIDEBAR_PAGES.map((item) => (
          <li key={item.id} className="relative flex justify-center">
            <RailButton label={item.title} active={page === item.id} onClick={() => onNavigate(item.id)}>
              <item.icon className="size-7" />
            </RailButton>
            {page === item.id && (
              <span className="absolute inset-y-3 right-0 w-0.5 rounded-l-full bg-highlight" />
            )}
          </li>
        ))}
      </ul>
      <ThemeToggle />
    </nav>
  )
}
