import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { IconType } from 'react-icons'
import {
  LuArrowLeft,
  LuArrowRight,
  LuCheck,
  LuFolderOpen,
  LuHardDrive,
  LuLayers,
  LuLoaderCircle,
  LuSquareTerminal,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { FolderPicker } from '@/features/onboarding/folder-picker'
import { ToolList } from '@/features/onboarding/tool-list'
import { MIN_NAME_LENGTH, ProfileFields } from '@/features/profile/profile-fields'
import { preloadAvatar, UserAvatar } from '@/features/profile/user-avatar'
import { ThemeToggle } from '@/features/theme/theme-toggle'
import {
  fetchFolders,
  fetchInstalledTools,
  saveAvatarSeed,
  saveServiceFolder,
  saveUserName,
  type FolderListing,
} from '@/lib/api'
import { cn } from '@/lib/utils'

const WELCOME_STEP = 0
const PROFILE_STEP = 1
const FOLDER_STEP = 2
const STEP_LABELS = ['Boas-vindas', 'Perfil', 'Sistema']

type OnboardingScreenProps = {
  initialName: string
  initialAvatarSeed: string | null
  onComplete: (name: string, avatarSeed: string | null) => void
}

function submitLabel(step: number, saving: boolean) {
  if (saving) {
    return 'Salvando...'
  }
  if (step === WELCOME_STEP) {
    return 'Começar'
  }
  return step === FOLDER_STEP ? 'Concluir' : 'Continuar'
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center" aria-label={`Etapa ${step + 1} de ${STEP_LABELS.length}`}>
      {STEP_LABELS.map((label, index) => (
        <li key={label} className={cn('flex items-center', index < STEP_LABELS.length - 1 && 'flex-1')}>
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
              index < step && 'border-primary bg-primary text-primary-foreground',
              index === step && 'border-primary text-highlight dark:border-highlight',
              index > step && 'border-border text-muted-foreground',
            )}
          >
            {index < step ? <LuCheck className="size-4" /> : index + 1}
          </span>
          <span
            className={cn(
              'ml-2 hidden text-sm sm:inline',
              index === step ? 'font-semibold' : 'text-muted-foreground',
            )}
          >
            {label}
          </span>
          {index < STEP_LABELS.length - 1 && (
            <span className={cn('mx-3 h-0.5 flex-1 rounded-full', index < step ? 'bg-primary dark:bg-highlight' : 'bg-border')} />
          )}
        </li>
      ))}
    </ol>
  )
}

function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1.5 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function Highlight({ icon: Icon, children }: { icon: IconType; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-highlight">
        <Icon className="size-[18px]" />
      </span>
      {children}
    </li>
  )
}

export function OnboardingScreen({ initialName, initialAvatarSeed, onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState(initialName ? FOLDER_STEP : WELCOME_STEP)
  const [name, setName] = useState(initialName)
  const [avatarSeed, setAvatarSeed] = useState(initialAvatarSeed)
  const [installedTools, setInstalledTools] = useState<string[]>([])
  const [destination, setDestination] = useState<FolderListing | null>(null)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const trimmedName = name.trim().toUpperCase()

  useEffect(() => {
    preloadAvatar(initialName)
  }, [initialName])

  useEffect(() => {
    let cancelled = false
    fetchFolders()
      .then((home) => {
        if (!cancelled) {
          setDestination(home)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Não foi possível consultar a pasta pessoal. Recarregue a página.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchInstalledTools()
      .then((tools) => {
        if (!cancelled) {
          setInstalledTools(tools)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [step])

  const finish = async () => {
    if (destination === null) {
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveServiceFolder(destination.target)
    } catch {
      setError('Não foi possível criar a pasta nesse destino. Escolha outro.')
      setSaving(false)
      return
    }
    try {
      const savedName = await saveUserName(trimmedName)
      await saveAvatarSeed(avatarSeed)
      onComplete(savedName, avatarSeed)
    } catch {
      setError('Não foi possível salvar. Tente novamente.')
      setSaving(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (step === FOLDER_STEP) {
      finish()
    } else {
      setStep(step + 1)
    }
  }

  const selectDestination = (listing: FolderListing) => {
    setDestination(listing)
    setPicking(false)
    setError('')
  }

  const blocked =
    saving ||
    (step === PROFILE_STEP && trimmedName.length < MIN_NAME_LENGTH) ||
    (step === FOLDER_STEP && destination === null)

  return (
    <div className="animate-in fade-in flex h-full items-center justify-center overflow-y-auto p-6 duration-300">
      <form
        className="w-full max-w-lg shrink-0 overflow-hidden rounded-2xl border bg-card shadow-lg shadow-black/5"
        onSubmit={submit}
      >
        <div className="border-b px-6 py-4">
          <Stepper step={step} />
        </div>
        <div
          key={step}
          className="animate-in fade-in slide-in-from-right-3 flex min-h-96 flex-col justify-center gap-6 px-8 py-8 duration-300"
        >
          {step === WELCOME_STEP && (
            <>
              <StepTitle title="Boas-vindas!" subtitle="Sua máquina, a um clique no navegador." />
              <ul className="mx-auto space-y-3">
                <Highlight icon={LuSquareTerminal}>Terminal real, com programas interativos</Highlight>
                <Highlight icon={LuLayers}>Consoles salvos sem limite artificial</Highlight>
                <Highlight icon={LuHardDrive}>Histórico salvo nesta máquina</Highlight>
              </ul>
            </>
          )}
          {step === PROFILE_STEP && (
            <>
              <ProfileFields
                name={name}
                avatarSeed={avatarSeed}
                label="Como podemos chamar você?"
                autoFocus
                onNameChange={setName}
                onAvatarSeedChange={setAvatarSeed}
              />
            </>
          )}
          {step === FOLDER_STEP && (
            <>
              <UserAvatar
                name={trimmedName}
                seed={avatarSeed}
                className="mx-auto size-14 text-lg ring-4 ring-primary-soft"
              />
              <StepTitle
                title={`Quase lá, ${trimmedName.split(/\s+/)[0]}`}
                subtitle="Escolha onde ficará a pasta de serviço."
              />
              <button
                type="button"
                aria-label="Escolher pasta"
                title={destination?.target}
                disabled={destination === null || saving}
                className="flex h-12 w-full items-center gap-3 rounded-lg border bg-background pr-1.5 pl-3.5 text-left text-sm transition-colors hover:border-highlight disabled:opacity-60"
                onClick={() => setPicking(true)}
              >
                {destination ? (
                  <span className="min-w-0 flex-1 truncate">{destination.target}</span>
                ) : (
                  <span className="flex flex-1 justify-center"><LuLoaderCircle className="size-4 animate-spin text-highlight" /></span>
                )}
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-highlight">
                  <LuFolderOpen className="size-[18px]" />
                </span>
              </button>
              <ToolList installed={installedTools} />
              {error && (
                <p role="alert" className="text-center text-sm text-destructive">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex items-center justify-between border-t px-6 py-4">
          {step === WELCOME_STEP ? (
            <ThemeToggle />
          ) : (
            <Button type="button" variant="ghost" className="h-10" disabled={saving} onClick={() => setStep(step - 1)}>
              <LuArrowLeft />
              Voltar
            </Button>
          )}
          <Button className="h-10 min-w-32 rounded-lg" type="submit" disabled={blocked}>
            {submitLabel(step, saving)}
            {!saving && <LuArrowRight />}
          </Button>
        </div>
      </form>
      {picking && destination !== null && (
        <FolderPicker initial={destination} onCancel={() => setPicking(false)} onSelect={selectDestination} />
      )}
    </div>
  )
}
