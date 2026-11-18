import { useState } from 'react'
import { AppLayout } from '@/features/layout/app-layout'
import { DEFAULT_PAGE, type Page } from '@/features/layout/pages'
import { OnboardingScreen } from '@/features/onboarding/onboarding-screen'
import type { HealthIssue } from '@/features/splash/health-issues'
import { SplashScreen } from '@/features/splash/splash-screen'

type Stage = 'splash' | 'onboarding' | 'app'

export default function App() {
  const [stage, setStage] = useState<Stage>('splash')
  const [userName, setUserName] = useState('')
  const [avatarSeed, setAvatarSeed] = useState<string | null>(null)
  const [initialPage, setInitialPage] = useState<Page>(DEFAULT_PAGE)
  const [warnings, setWarnings] = useState<HealthIssue[]>([])

  const enter = (name: string, seed: string | null) => {
    setUserName(name)
    setAvatarSeed(seed)
    setStage('app')
  }

  const finishSplash = (
    name: string | null,
    seed: string | null,
    lastPage: Page,
    issues: HealthIssue[],
    needsServiceFolder: boolean,
  ) => {
    setWarnings(issues)
    setInitialPage(lastPage)
    setAvatarSeed(seed)
    if (name === null || needsServiceFolder) {
      setUserName(name ?? '')
      setStage('onboarding')
    } else {
      enter(name, seed)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {warnings.map((warning) => (
        <p key={warning.title} role="alert" className="shrink-0 bg-warning/15 px-4 py-2 text-sm">
          {warning.title}. {warning.hint}
        </p>
      ))}
      <div className="min-h-0 flex-1">
        {stage === 'splash' && <SplashScreen onFinish={finishSplash} />}
        {stage === 'onboarding' && <OnboardingScreen initialName={userName} initialAvatarSeed={avatarSeed} onComplete={enter} />}
        {stage === 'app' && <AppLayout userName={userName} avatarSeed={avatarSeed} initialPage={initialPage} />}
      </div>
    </div>
  )
}
