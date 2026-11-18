import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type InputHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { LuPlus } from 'react-icons/lu'
import type { ApiClientVariable } from '../../api'

type VariableInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  value: string
  variables: ApiClientVariable[]
  onChange: (value: string) => void
  onCreateVariable?: (name: string) => void
}

export function VariableInput({
  value,
  variables,
  onChange,
  onCreateVariable,
  className,
  ...rest
}: VariableInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdown, setDropdown] = useState<{
    query: string
    cursorStart: number
    rect: DOMRect
  } | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  const closeDropdown = useCallback(() => setDropdown(null), [])

  const candidates = dropdown
    ? variables.filter((v) => v.name.toLowerCase().startsWith(dropdown.query.toLowerCase()))
    : []

  const showCreate =
    dropdown &&
    dropdown.query.length > 0 &&
    !variables.find((v) => v.name === dropdown.query)

  const totalOptions = candidates.length + (showCreate ? 1 : 0)

  const insert = useCallback(
    (name: string) => {
      const input = inputRef.current
      if (!input || !dropdown) return
      const before = value.slice(0, dropdown.cursorStart)
      const after = value.slice(input.selectionEnd ?? dropdown.cursorStart)
      onChange(before + '{{' + name + '}}' + after)
      closeDropdown()
      requestAnimationFrame(() => {
        const pos = dropdown.cursorStart + name.length + 4
        input.setSelectionRange(pos, pos)
        input.focus()
      })
    },
    [value, dropdown, onChange, closeDropdown],
  )

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    const cursor = e.target.selectionStart ?? 0
    const text = e.target.value
    const before = text.slice(0, cursor)
    const match = before.match(/\{\{([^}]*)$/)
    if (match) {
      const rect = e.target.getBoundingClientRect()
      setDropdown({ query: match[1], cursorStart: before.indexOf('{{', before.length - match[0].length), rect })
      setActiveIdx(0)
    } else {
      closeDropdown()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (dropdown && totalOptions > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % totalOptions)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => (i - 1 + totalOptions) % totalOptions)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (activeIdx < candidates.length) {
          insert(candidates[activeIdx].name)
        } else if (showCreate) {
          onCreateVariable?.(dropdown.query)
          closeDropdown()
        }
        return
      }
      if (e.key === 'Escape') {
        closeDropdown()
        return
      }
    }
    rest.onKeyDown?.(e)
  }

  useEffect(() => {
    if (!dropdown) return
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node) && e.target !== inputRef.current) {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdown, closeDropdown])

  const dropdownTop = dropdown ? dropdown.rect.bottom + window.scrollY + 2 : 0
  const dropdownLeft = dropdown ? dropdown.rect.left + window.scrollX : 0
  const dropdownWidth = dropdown ? Math.max(dropdown.rect.width, 200) : 0

  return (
    <>
      <input
        {...rest}
        ref={inputRef}
        value={value}
        className={className}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          rest.onBlur?.(e)
          setTimeout(closeDropdown, 150)
        }}
      />
      {dropdown && totalOptions > 0 &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-50 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg"
            style={{ top: dropdownTop, left: dropdownLeft, width: dropdownWidth }}
          >
            {candidates.map((v, i) => (
              <button
                key={v.id}
                type="button"
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted ${i === activeIdx ? 'bg-muted' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); insert(v.name) }}
              >
                <span className="font-mono font-semibold text-highlight">{v.name}</span>
                {v.value && (
                  <span className="ml-auto truncate text-muted-foreground" style={{ maxWidth: 120 }}>
                    {v.value}
                  </span>
                )}
              </button>
            ))}
            {showCreate && (
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted ${activeIdx === candidates.length ? 'bg-muted' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onCreateVariable?.(dropdown.query)
                  closeDropdown()
                }}
              >
                <LuPlus className="size-3 shrink-0 text-muted-foreground" />
                <span>
                  Criar variável <span className="font-mono font-semibold text-highlight">"{dropdown.query}"</span>
                </span>
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
