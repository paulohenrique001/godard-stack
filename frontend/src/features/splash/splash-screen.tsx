import { useEffect, useState } from 'react'
import { LuCircleX } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { AppLogo } from '@/features/brand/app-logo'
import { pageForCurrentTab } from '@/features/layout/page-preference'
import { BACKEND_OFFLINE, healthIssues, type HealthIssue } from '@/features/splash/health-issues'
import type { Page } from '@/features/layout/pages'
import {
  fetchAvatarSeed,
  fetchHealth,
  fetchUserName,
  saveServiceFolder,
  type HealthResult,
} from '@/lib/api'

const STEP_DURATIONS_MS = [100, 250, 500]
const BACKEND_WAIT_MS = 15000
const BACKEND_RETRY_MS = 1000
const WAITING_LABEL = 'Aguardando o serviço iniciar'
const STEPS = [
  'Conectando ao serviço',
  'Verificando o banco de dados',
  'Verificando o disco de dados',
  'Verificando o agente',
  'Verificando o shell',
  'Verificando a pasta de serviço',
]

const REPAIR_FAILED: HealthIssue = {
  title: 'Pasta de serviço não recriada',
  hint: 'Não foi possível gravar no destino. Confira as permissões e o espaço em disco.',
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const randomStepDuration = () => STEP_DURATIONS_MS[Math.floor(Math.random() * STEP_DURATIONS_MS.length)]

async function waitForBackend(isCancelled: () => boolean, onWaiting: () => void): Promise<HealthResult> {
  const deadline = Date.now() + BACKEND_WAIT_MS
  let result = await fetchHealth()
  while (result.kind === 'unreachable' && Date.now() < deadline && !isCancelled()) {
    onWaiting()
    await delay(BACKEND_RETRY_MS)
    result = await fetchHealth()
  }
  return result
}

type SplashScreenProps = {
  onFinish: (
    userName: string | null,
    avatarSeed: string | null,
    lastPage: Page,
    warnings: HealthIssue[],
    needsServiceFolder: boolean,
  ) => void
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [blockers, setBlockers] = useState<HealthIssue[]>([])
  const [attempt, setAttempt] = useState(0)
  const [step, setStep] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const failed = blockers.length > 0
  const repairPath = blockers.find((blocker) => blocker.repairPath)?.repairPath

  useEffect(() => {
    let cancelled = false

    const showSteps = async () => {
      for (let index = 0; index < STEPS.length && !cancelled; index += 1) {
        setStep(index)
        await delay(randomStepDuration())
      }
    }

    const verify = async () => {
      const [result] = await Promise.all([
        waitForBackend(
          () => cancelled,
          () => setWaiting(true),
        ),
        showSteps(),
      ])
      if (cancelled) {
        return
      }
      setWaiting(false)
      const issues = healthIssues(result)
      if (issues.blockers.length > 0) {
        setBlockers(issues.blockers)
        return
      }
      try {
        const [userName, avatarSeed] = await Promise.all([
          fetchUserName(),
          fetchAvatarSeed(),
        ])
        if (!cancelled) {
          const needsServiceFolder = result.kind === 'report' && result.report.serviceFolder === 'unset'
          onFinish(userName, avatarSeed, pageForCurrentTab(), issues.warnings, needsServiceFolder)
        }
      } catch {
        setBlockers([BACKEND_OFFLINE])
      }
    }
    verify()

    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = () => {
    setBlockers([])
    setStep(0)
    setAttempt((value) => value + 1)
  }

  const repair = async () => {
    if (repairPath === undefined) {
      return
    }
    setRepairing(true)
    try {
      await saveServiceFolder(repairPath)
      retry()
    } catch {
      setBlockers([REPAIR_FAILED])
    }
    setRepairing(false)
  }

  const label = waiting ? WAITING_LABEL : STEPS[step]

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <AppLogo className="animate-in fade-in zoom-in-90 size-32 duration-500" />
      {failed ? (
        <div className="animate-in fade-in slide-in-from-bottom-2 w-full max-w-md space-y-4 duration-300">
          <p className="text-center text-sm text-muted-foreground">
            Encontramos um problema ao preparar a aplicação.
          </p>
          <ul className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
            {blockers.map((blocker) => (
              <li key={blocker.title} className="flex gap-3">
                <LuCircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{blocker.title}</p>
                  <p className="text-sm wrap-anywhere text-muted-foreground">{blocker.hint}</p>
                </div>
              </li>
            ))}
          </ul>
          {repairPath !== undefined && (
            <Button size="lg" className="w-full" disabled={repairing} onClick={repair}>
              {repairing ? 'Recriando...' : 'Recriar pasta'}
            </Button>
          )}
          <Button
            size="lg"
            variant={repairPath === undefined ? 'default' : 'outline'}
            className="w-full"
            disabled={repairing}
            onClick={retry}
          >
            Tentar novamente
          </Button>
        </div>
      ) : (
        <div className="animate-in fade-in fill-mode-both flex w-64 flex-col items-center gap-3 delay-300 duration-500">
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="splash-progress h-full w-1/3 rounded-full bg-primary dark:bg-highlight" />
          </div>
          <p key={label} role="status" className="animate-in fade-in text-xs text-muted-foreground duration-100">
            {label}
          </p>
        </div>
      )}
    </div>
  )
}
