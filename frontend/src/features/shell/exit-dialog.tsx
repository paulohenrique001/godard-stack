import { useModalDialog } from '../accessibility/use-modal-dialog'

export function ExitDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useModalDialog(true, onCancel)

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-6 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onCancel}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-title"
        className="w-full max-w-md rounded-2xl border bg-popover p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="exit-title" className="text-lg font-semibold tracking-tight">
          Sair do Godard?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Você deseja fechar o aplicativo?</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            data-dialog-initial-focus
            type="button"
            className="h-9 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="h-9 rounded-lg bg-destructive px-3 text-sm font-medium text-white transition-colors hover:brightness-95"
            onClick={onConfirm}
          >
            Sair
          </button>
        </div>
      </section>
    </div>
  )
}
