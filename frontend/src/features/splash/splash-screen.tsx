import { useEffect, useState } from 'react'
import { LuMaximize2, LuMinus, LuX } from 'react-icons/lu'
import type { RuntimeStatus } from '../../api'
import type { RecoveryPhase } from '../app/use-auto-recovery'
import { AppLogo } from '../brand/app-logo'
import { runDesktopWindowAction } from '../shell/window-actions'

const SPLASH_STEPS = [
  'Conectando ao serviço',
  'Verificando o banco de dados',
  'Preparando os dados locais',
  'Verificando os módulos disponíveis',
]

type SplashScreenProps = {
  runtime: RuntimeStatus
  error: string | null
  recovery: RecoveryPhase
  onRequestExit: () => void
}

export function SplashScreen({ runtime, error, recovery, onRequestExit }: SplashScreenProps) {
  const permanentlyFailed = recovery.kind === 'failed'
  const isRecovering = recovery.kind === 'recovering'
  const failed = runtime.status === 'failed' && !isRecovering
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (permanentlyFailed) return
    const timer = window.setInterval(
      () => setStep((current) => (current + 1) % SPLASH_STEPS.length),
      450,
    )
    return () => window.clearInterval(timer)
  }, [permanentlyFailed])

  const statusMessage =
    permanentlyFailed
      ? 'Recuperação automática falhou.'
      : isRecovering
        ? (recovery as Extract<RecoveryPhase, { kind: 'recovering' }>).message
        : failed
          ? 'Verificando o aplicativo...'
          : SPLASH_STEPS[step]

  const statusKey =
    permanentlyFailed
      ? 'perm-failed'
      : isRecovering
        ? `recover-${(recovery as Extract<RecoveryPhase, { kind: 'recovering' }>).level}`
        : failed
          ? 'checking'
          : String(step)

  return (
    <main className="relative flex h-full flex-col items-center justify-center gap-6 p-6">
      <div
        className="absolute top-0 right-0 flex items-center gap-1 p-3"
        role="group"
        aria-label="Controles da janela"
      >
        <button
          type="button"
          aria-label="Minimizar janela"
          title="Minimizar"
          className="size-9 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => runDesktopWindowAction((w) => w.minimize())}
        >
          <LuMinus className="mx-auto size-4" />
        </button>
        <button
          type="button"
          aria-label="Maximizar ou restaurar janela"
          title="Maximizar ou restaurar"
          className="size-9 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => runDesktopWindowAction((w) => w.toggleMaximize())}
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
      <AppLogo className="animate-in fade-in zoom-in-90 size-32 duration-500" />
      <div className="animate-in fade-in fill-mode-both flex w-64 flex-col items-center gap-3 delay-300 duration-500">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="splash-progress h-full w-1/3 rounded-full bg-primary dark:bg-highlight" />
        </div>
        <p
          key={statusKey}
          role={permanentlyFailed ? 'alert' : 'status'}
          className="animate-in fade-in text-center text-xs text-muted-foreground duration-100"
        >
          {statusMessage}
        </p>
        {permanentlyFailed && (recovery as Extract<RecoveryPhase, { kind: 'failed' }>).backupPath && (
          <p className="max-w-xs text-center text-xs text-muted-foreground/60 break-all">
            Backup salvo em:{' '}
            {(recovery as Extract<RecoveryPhase, { kind: 'failed' }>).backupPath}
          </p>
        )}
      </div>
    </main>
  )
}
