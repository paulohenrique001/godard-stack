import { type ReactNode } from 'react'
import { useModalDialog } from '../accessibility/use-modal-dialog'

type ApiClientDialogProps = {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
  children?: ReactNode
}

export function ApiClientDialog({
  title,
  description,
  confirmLabel,
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
  children,
}: ApiClientDialogProps) {
  const dialogRef = useModalDialog(true, busy ? undefined : onCancel)

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={() => {
        if (!busy) onCancel()
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-client-dialog-title"
        className="w-full max-w-md rounded-2xl border bg-popover p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="api-client-dialog-title" className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {children && <div className="mt-5">{children}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            data-dialog-initial-focus
            type="button"
            disabled={busy}
            className="h-9 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            className={`h-9 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-50 ${
              destructive
                ? 'bg-destructive text-white hover:brightness-95'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
            onClick={onConfirm}
          >
            {busy ? 'Salvando…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
