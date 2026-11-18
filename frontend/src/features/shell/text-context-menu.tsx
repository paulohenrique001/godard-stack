import { useEffect, useRef, useState } from 'react'
import { LuCopy, LuScissors, LuClipboard, LuMousePointer2 } from 'react-icons/lu'

type Menu = { x: number; y: number; target: HTMLInputElement | HTMLTextAreaElement }

function isEditable(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase()
    return !['checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'button', 'image'].includes(t)
  }
  return false
}

export function TextContextMenu() {
  const [menu, setMenu] = useState<Menu | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      if (!isEditable(e.target)) return
      e.preventDefault()
      setMenu({ x: e.clientX, y: e.clientY, target: e.target as HTMLInputElement | HTMLTextAreaElement })
    }
    const onClose = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('contextmenu', onContext)
    window.addEventListener('mousedown', onClose)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('contextmenu', onContext)
      window.removeEventListener('mousedown', onClose)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!menu) return null

  const el = menu.target
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  const hasSelection = start !== end
  const isPassword = el instanceof HTMLInputElement && el.type === 'password'
  const isDisabled = el.disabled || (el as HTMLInputElement).readOnly

  const close = () => setMenu(null)

  const cut = () => {
    if (isPassword || !hasSelection) return
    const text = el.value.slice(start, end)
    void navigator.clipboard.writeText(text)
    const next = el.value.slice(0, start) + el.value.slice(end)
    const nativeInput = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set
    nativeInput?.call(el, next)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.setSelectionRange(start, start)
    close()
  }

  const copy = () => {
    if (isPassword || !hasSelection) return
    void navigator.clipboard.writeText(el.value.slice(start, end))
    close()
  }

  const paste = async () => {
    if (isDisabled) return
    try {
      const text = await navigator.clipboard.readText()
      const next = el.value.slice(0, start) + text + el.value.slice(end)
      const nativeInput = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set
      nativeInput?.call(el, next)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      const pos = start + text.length
      el.setSelectionRange(pos, pos)
    } catch {}
    close()
  }

  const selectAll = () => {
    el.focus()
    el.setSelectionRange(0, el.value.length)
    close()
  }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const menuW = 160
  const menuH = 140
  const x = menu.x + menuW > vw ? vw - menuW - 8 : menu.x
  const y = menu.y + menuH > vh ? vh - menuH - 8 : menu.y

  const itemCls = (disabled: boolean) =>
    `flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${disabled ? 'pointer-events-none opacity-35' : 'hover:bg-muted'}`

  return (
    <div
      ref={ref}
      className="fixed z-[200] min-w-40 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg"
      style={{ top: y, left: x }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" className={itemCls(isPassword || !hasSelection || isDisabled)} onClick={cut}>
        <LuScissors className="size-3.5 shrink-0 text-muted-foreground" />
        Recortar
      </button>
      <button type="button" className={itemCls(isPassword || !hasSelection)} onClick={copy}>
        <LuCopy className="size-3.5 shrink-0 text-muted-foreground" />
        Copiar
      </button>
      <button type="button" className={itemCls(isDisabled)} onClick={() => void paste()}>
        <LuClipboard className="size-3.5 shrink-0 text-muted-foreground" />
        Colar
      </button>
      <div className="my-1 h-px bg-border" />
      <button type="button" className={itemCls(el.value.length === 0)} onClick={selectAll}>
        <LuMousePointer2 className="size-3.5 shrink-0 text-muted-foreground" />
        Selecionar tudo
      </button>
    </div>
  )
}
