import { Component, type ReactNode } from 'react'
import { LuCircleAlert } from 'react-icons/lu'

type ModuleBoundaryProps = {
  label: string
  children: ReactNode
}

type ModuleBoundaryState = {
  failed: boolean
}

export class ModuleBoundary extends Component<ModuleBoundaryProps, ModuleBoundaryState> {
  state: ModuleBoundaryState = { failed: false }

  static getDerivedStateFromError(): ModuleBoundaryState {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section
        className="flex flex-1 items-center justify-center p-6 text-center"
        role="alert"
      >
        <div className="max-w-md space-y-4">
          <LuCircleAlert className="mx-auto size-16 text-destructive/60" strokeWidth={1.25} />
          <h2 className="text-xl font-semibold tracking-tight">{this.props.label} indisponível</h2>
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar este módulo agora. Os demais recursos continuam disponíveis.
          </p>
        </div>
      </section>
    )
  }
}
