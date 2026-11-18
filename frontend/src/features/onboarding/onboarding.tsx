import { Fragment, useState, type FormEvent } from 'react'
import type { IconType } from 'react-icons'
import {
  LuArrowLeft,
  LuArrowRight,
  LuCheck,
  LuHardDrive,
  LuLayers,
  LuLayoutDashboard,
  LuMaximize2,
  LuMinus,
  LuMoon,
  LuSquareTerminal,
  LuSun,
  LuX,
} from 'react-icons/lu'
import type { UserProfile } from '../../api'
import { cn } from '../../shared/lib/cn'
import { ProfileFields, randomComposedName } from '../profile/profile-fields'
import { runDesktopWindowAction } from '../shell/window-actions'
import { UserAvatar } from '../profile/user-avatar'

const STEP_LABELS = ['Boas-vindas', 'Perfil', 'Sistema']

type OnboardingProps = {
  onComplete: (profile: UserProfile) => Promise<void>
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onRequestExit: () => void
}

export function Onboarding({ onComplete, theme, onToggleTheme, onRequestExit }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(() => randomComposedName())
  const [avatarSeed, setAvatarSeed] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmedName = name.trim().toUpperCase()
  const ThemeIcon = theme === 'dark' ? LuSun : LuMoon
  const themeLabel = theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (step < STEP_LABELS.length - 1) {
      setStep((current) => current + 1)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onComplete({ name: trimmedName, avatarSeed, email: null, language: null })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar seu perfil.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="animate-in fade-in relative flex h-full items-center justify-center overflow-y-auto p-6 duration-300">
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
      <form
        className="w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-lg shadow-black/5"
        onSubmit={submit}
      >
        <OnboardingSteps activeStep={step} />
        <div className="animate-in fade-in slide-in-from-right-3 flex min-h-96 flex-col justify-center gap-6 px-8 py-8 duration-300">
          {step === 0 ? (
            <WelcomeStep />
          ) : step === 1 ? (
            <ProfileFields
              name={name}
              avatarSeed={avatarSeed}
              label="Como podemos chamar você?"
              autoFocus
              onNameChange={setName}
              onAvatarSeedChange={setAvatarSeed}
            />
          ) : (
            <ReadyStep name={trimmedName} avatarSeed={avatarSeed} error={error} />
          )}
        </div>
        <footer className="flex items-center justify-between border-t px-6 py-4">
          {step > 0 ? (
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-lg px-3 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              disabled={saving}
              onClick={() => setStep((current) => current - 1)}
            >
              <LuArrowLeft className="size-4" />
              Voltar
            </button>
          ) : (
            <button
              type="button"
              aria-label={themeLabel}
              title={themeLabel}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onToggleTheme}
            >
              <ThemeIcon className="size-[18px]" />
            </button>
          )}
          <button
            className="flex h-10 min-w-32 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            type="submit"
            disabled={saving || (step === 1 && trimmedName.length < 3)}
          >
            {saving
              ? 'Salvando...'
              : step === 0
                ? 'Começar'
                : step === 1
                  ? 'Continuar'
                  : 'Concluir'}
            {!saving && <LuArrowRight className="size-4" />}
          </button>
        </footer>
      </form>
    </main>
  )
}

function OnboardingSteps({ activeStep }: { activeStep: number }) {
  return (
    <div className="border-b px-6 py-4">
      <ol
        className="flex items-center"
        aria-label={`Etapa ${activeStep + 1} de ${STEP_LABELS.length}`}
      >
        {STEP_LABELS.map((label, index) => {
          const active = activeStep === index
          const complete = index < activeStep
          return (
            <li
              key={label}
              className={cn('flex items-center', index < STEP_LABELS.length - 1 && 'flex-1')}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  complete && 'border-primary bg-primary text-primary-foreground',
                  active && 'border-primary text-highlight dark:border-highlight',
                  !active && !complete && 'border-border text-muted-foreground',
                )}
              >
                {complete ? <LuCheck className="size-4" /> : index + 1}
              </span>
              <span
                className={cn(
                  'ml-2 hidden text-sm sm:inline',
                  active ? 'font-semibold' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
              {index < STEP_LABELS.length - 1 && (
                <span
                  className={cn(
                    'mx-3 h-0.5 flex-1 rounded-full',
                    complete ? 'bg-primary dark:bg-highlight' : 'bg-border',
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function WelcomeStep() {
  return (
    <Fragment>
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Boas-vindas!</h1>
        <p className="text-muted-foreground">Sua central local, agora em uma aplicação desktop.</p>
      </div>
      <ul className="mx-auto space-y-3">
        <OnboardingHighlight icon={LuSquareTerminal}>
          Terminal, Docker e SGBD funcionam por módulos independentes
        </OnboardingHighlight>
        <OnboardingHighlight icon={LuLayers}>
          Módulos independentes sem dependências obrigatórias
        </OnboardingHighlight>
        <OnboardingHighlight icon={LuHardDrive}>
          Dados e preferências ficam somente nesta máquina
        </OnboardingHighlight>
      </ul>
    </Fragment>
  )
}

function ReadyStep({
  name,
  avatarSeed,
  error,
}: {
  name: string
  avatarSeed: string | null
  error: string | null
}) {
  return (
    <Fragment>
      <UserAvatar
        name={name}
        seed={avatarSeed}
        className="mx-auto size-14 text-lg ring-4 ring-primary-soft"
      />
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Quase lá, {name.split(/\s+/)[0]}</h1>
        <p className="text-muted-foreground">O núcleo local já está preparado para sua máquina.</p>
      </div>
      <ul className="mx-auto space-y-3">
        <OnboardingHighlight icon={LuHardDrive}>
          Banco SQLite criado apenas nesta instalação
        </OnboardingHighlight>
        <OnboardingHighlight icon={LuLayoutDashboard}>
          Dashboard pronta para receber seus módulos
        </OnboardingHighlight>
      </ul>
      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </Fragment>
  )
}

function OnboardingHighlight({ icon: Icon, children }: { icon: IconType; children: string }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-highlight">
        <Icon className="size-[18px]" />
      </span>
      {children}
    </li>
  )
}
