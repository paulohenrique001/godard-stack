import { useEffect, useRef, useState } from 'react'
import { LuDices, LuGrid3X3 } from 'react-icons/lu'
import { cn } from '../lib/cn'
import {
  ALL_EMOJIS,
  DEFAULT_ICON_COLOR,
  EMOJI_CATEGORIES,
  ICON_CATEGORIES,
  ICON_COLORS,
  LUCIDE_ICONS,
  randomEmoji,
} from './icon-data'
import { IconDisplay } from './icon-display'
import { buildLucideIconValue, parseIconValue } from './icon-value'

const RECENTS_KEY = 'icon-picker.recents'
const SKIN_TONE_KEY = 'icon-picker.skin-tone'
const MAX_RECENTS = 16

// ─── skin tones ───────────────────────────────────────────────────────────────

const SKIN_TONES = [
  { label: 'Padrão',       modifier: '',   color: '#FFCC4D' },
  { label: 'Claro',        modifier: '🏻', color: '#FFDBB4' },
  { label: 'Claro-médio',  modifier: '🏼', color: '#E8B88A' },
  { label: 'Médio',        modifier: '🏽', color: '#C88A5D' },
  { label: 'Médio-escuro', modifier: '🏾', color: '#A65C3A' },
  { label: 'Escuro',       modifier: '🏿', color: '#59351F' },
]

// First code point of each emoji in our dataset that accepts a tone modifier
const TONE_BASES = new Set([
  // People
  '🧑', '👩', '👨', '🧒', '👶', '🧓', '👴', '👵', '🦸', '🧙',
  '🤸', '🏄', '🧗', '🏋', '🚴',
  '🧑', '🧑', // professions (same base)
  // Hand gestures
  '👋', '🤚', '🖐', '✋', '🖖', '🤙', '👌', '🤌', '🤏', '✌',
  '🤞', '🤟', '🤘', '👈', '👉', '👆', '👇', '☝', '👍', '👎',
  '✊', '👊', '🤛', '🤜', '🤝', '🙌', '👏', '🫶', '🤲', '🙏',
])

function supportsTone(emoji: string): boolean {
  const cp = emoji.codePointAt(0)
  return cp !== undefined && TONE_BASES.has(String.fromCodePoint(cp))
}

function applyTone(emoji: string, modifier: string): string {
  // Always strip any existing tone modifier first
  let base = emoji
  for (const t of SKIN_TONES) {
    if (t.modifier) base = base.split(t.modifier).join('')
  }
  // Only apply if this emoji actually supports skin tone
  if (!modifier || !supportsTone(base)) return base
  const ZWJ = '‍'
  if (base.includes(ZWJ)) {
    const parts = base.split(ZWJ)
    return parts[0] + modifier + ZWJ + parts.slice(1).join(ZWJ)
  }
  return base + modifier
}

// ─── global recents store (shared across all picker instances) ────────────────

type RecentsListener = (r: string[]) => void
const _recentsListeners = new Set<RecentsListener>()
let _recentsCache: string[] | null = null

function _initRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch { return [] }
}

function getRecents(): string[] {
  if (!_recentsCache) _recentsCache = _initRecents()
  return _recentsCache
}

function saveRecent(value: string) {
  const updated = [value, ...getRecents().filter((v) => v !== value)].slice(0, MAX_RECENTS)
  _recentsCache = updated
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(updated)) } catch {}
  _recentsListeners.forEach((fn) => fn(updated))
}

function useRecentsStore(): string[] {
  const [recents, setRecents] = useState<string[]>(getRecents)
  useEffect(() => {
    _recentsListeners.add(setRecents)
    return () => { _recentsListeners.delete(setRecents) }
  }, [])
  return recents
}

function loadSkinTone(): string {
  try { return localStorage.getItem(SKIN_TONE_KEY) ?? '' } catch { return '' }
}

function saveSkinTone(v: string) {
  try { localStorage.setItem(SKIN_TONE_KEY, v) } catch {}
}

function randomLucideValue(color: string): string {
  const entry = LUCIDE_ICONS[Math.floor(Math.random() * LUCIDE_ICONS.length)]
  return buildLucideIconValue(entry.name, color)
}

// ─── icon picker ──────────────────────────────────────────────────────────────

type Tab = 'emoji' | 'icon'

type IconPickerProps = {
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md'
}

export function IconPicker({ value, onChange, size = 'md' }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // capture phase: fires before stopPropagation in dialogs can block it
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open])

  // select = save + update + close; pick = save + update only (random)
  const pick = (v: string) => { saveRecent(v); onChange(v) }
  const select = (v: string) => { pick(v); setOpen(false) }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label="Escolher ícone"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center justify-center rounded-lg border bg-muted transition-colors hover:bg-accent',
          size === 'md' ? 'size-11 text-xl' : 'size-8 text-base',
        )}
      >
        <IconDisplay value={value} className="size-full" iconClassName="size-5" />
      </button>
      {open && <IconPopover value={value} onSelect={select} onPick={pick} />}
    </div>
  )
}

// ─── popover ──────────────────────────────────────────────────────────────────

function IconPopover({
  value, onSelect, onPick,
}: {
  value: string
  onSelect: (v: string) => void
  onPick: (v: string) => void
}) {
  const [tab, setTab] = useState<Tab>(() => value.startsWith('@') ? 'icon' : 'emoji')
  const [emojiSearch, setEmojiSearch] = useState('')
  const [iconSearch, setIconSearch] = useState('')
  const [emojiCat, setEmojiCat] = useState<number | null>(null)
  const [iconCat, setIconCat] = useState<number | null>(null)
  const [subOpen, setSubOpen] = useState(false)
  const subRef = useRef<HTMLDivElement>(null)
  const parsed = parseIconValue(value)
  const [color, setColor] = useState(parsed.type === 'lucide' ? parsed.color : DEFAULT_ICON_COLOR)
  const [skinTone, setSkinTone] = useState(() => loadSkinTone())
  const recents = useRecentsStore()
  const emojiRecents = recents.filter((v) => !v.startsWith('@')).slice(0, MAX_RECENTS)
  const iconRecents = recents.filter((v) => v.startsWith('@')).slice(0, MAX_RECENTS)
  const currentTone = SKIN_TONES.find((t) => t.modifier === skinTone) ?? SKIN_TONES[0]

  useEffect(() => {
    if (!subOpen) return
    const onDown = (e: MouseEvent) => {
      if (subRef.current && !subRef.current.contains(e.target as Node)) setSubOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [subOpen])

  const handleSkinTone = (modifier: string) => {
    setSkinTone(modifier)
    saveSkinTone(modifier)
    setSubOpen(false)
    // Update the currently selected emoji with the new tone (if it supports it)
    if (!value.startsWith('@')) onPick(applyTone(value, modifier))
  }
  const handleColor = (c: string) => {
    setColor(c)
    setSubOpen(false)
    if (value.startsWith('@')) {
      const rest = value.slice(1)
      const colonIdx = rest.lastIndexOf(':')
      const name = colonIdx === -1 ? rest : rest.slice(0, colonIdx)
      onPick(buildLucideIconValue(name, c))
    }
  }

  const selectEmoji = (emoji: string) => onSelect(applyTone(emoji, skinTone))
  const pickEmoji   = (emoji: string) => onPick(applyTone(emoji, skinTone))

  return (
    <div className="absolute top-full left-0 z-50 mt-1.5 w-72 overflow-hidden rounded-xl border bg-popover shadow-xl">
      {/* tab bar */}
      <div className="flex items-center border-b px-3 pt-2.5 pb-0">
        {(['emoji', 'icon'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={cn(
              'px-3 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t
                ? 'border-highlight text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => { setTab(t); setSubOpen(false) }}
          >
            {t === 'emoji' ? 'Emoji' : 'Ícone'}
          </button>
        ))}

        {/* skin-tone / color button */}
        <div ref={subRef} className="relative ml-auto mb-px">
          <button
            type="button"
            title={tab === 'emoji' ? 'Tom de pele' : 'Cor do ícone'}
            className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted"
            onClick={() => setSubOpen((o) => !o)}
          >
            <span
              className="size-3.5 rounded-full border border-black/10"
              style={{ background: tab === 'emoji' ? currentTone.color : color }}
            />
          </button>

          {subOpen && tab === 'emoji' && (
            <div className="absolute top-full right-0 z-[60] mt-1 flex gap-2 rounded-xl border bg-popover p-2 shadow-xl">
              {SKIN_TONES.map((tone) => (
                <button
                  key={tone.modifier}
                  type="button"
                  title={tone.label}
                  className="size-6 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: tone.color,
                    outline: skinTone === tone.modifier ? `2px solid ${tone.color}` : undefined,
                    outlineOffset: 2,
                  }}
                  onClick={(e) => { e.stopPropagation(); handleSkinTone(tone.modifier) }}
                />
              ))}
            </div>
          )}

          {subOpen && tab === 'icon' && (
            <div className="absolute top-full right-0 z-[60] mt-1 w-44 rounded-xl border bg-popover p-2 shadow-xl">
              <div className="grid grid-cols-5 gap-2">
                {ICON_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    className="size-6 rounded-full transition-transform hover:scale-110"
                    style={{
                      background: c.value,
                      outline: color === c.value ? `2px solid ${c.value}` : undefined,
                      outlineOffset: 2,
                    }}
                    onClick={(e) => { e.stopPropagation(); handleColor(c.value) }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-2">
        {tab === 'emoji' ? (
          <EmojiPane
            search={emojiSearch}
            catIndex={emojiCat}
            recents={emojiRecents}
            skinTone={skinTone}
            onSearch={setEmojiSearch}
            onSelect={selectEmoji}
            onPick={pickEmoji}
            onCatChange={setEmojiCat}
          />
        ) : (
          <IconPane
            search={iconSearch}
            catIndex={iconCat}
            recents={iconRecents}
            color={color}
            onSearch={setIconSearch}
            onSelect={onSelect}
            onPick={(name) => onPick(buildLucideIconValue(name, color))}
            onCatChange={setIconCat}
          />
        )}
      </div>
    </div>
  )
}

// ─── emoji pane ───────────────────────────────────────────────────────────────

function EmojiPane({
  search, catIndex, recents, skinTone, onSearch, onSelect, onPick, onCatChange,
}: {
  search: string
  catIndex: number | null
  recents: string[]
  skinTone: string
  onSearch: (v: string) => void
  onSelect: (v: string) => void
  onPick: (v: string) => void
  onCatChange: (i: number | null) => void
}) {
  const isAll = catIndex === null
  const q = search.trim().toLowerCase()
  const searchResults: string[] | null = q
    ? EMOJI_CATEGORIES
        .filter((c) => c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.includes(q)))
        .flatMap((c) => c.emojis)
    : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          placeholder="Filtrar..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          title="Aleatório"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => onPick(randomEmoji())}
        >
          <LuDices className="size-3.5" />
        </button>
      </div>
      <div className="h-48 overflow-y-auto">
        {searchResults ? (
          searchResults.length > 0
            ? <EmojiGrid emojis={searchResults} skinTone={skinTone} onSelect={onSelect} />
            : <p className="py-6 text-center text-xs text-muted-foreground">Nenhum resultado.</p>
        ) : isAll ? (
          <>
            {recents.length > 0 && (
              <>
                <SectionLabel label="Recentes" />
                <EmojiGrid emojis={recents} skinTone={skinTone} onSelect={onSelect} />
              </>
            )}
            {EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <SectionLabel label={cat.label} />
                <EmojiGrid emojis={cat.emojis} skinTone={skinTone} onSelect={onSelect} />
              </div>
            ))}
          </>
        ) : (
          <>
            <SectionLabel label={EMOJI_CATEGORIES[catIndex].label} />
            <EmojiGrid emojis={EMOJI_CATEGORIES[catIndex].emojis} skinTone={skinTone} onSelect={onSelect} />
          </>
        )}
      </div>
      {!q && (
        <div className="flex items-center justify-between border-t pt-1.5">
          <button
            type="button"
            title="Todos"
            className={cn(
              'flex size-7 items-center justify-center rounded-md transition-colors',
              isAll ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            onClick={() => onCatChange(null)}
          >
            <LuGrid3X3 className="size-3.5" />
          </button>
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              type="button"
              title={cat.label}
              className={cn(
                'flex size-7 items-center justify-center rounded-md text-sm transition-colors',
                catIndex === i ? 'bg-muted' : 'text-muted-foreground hover:bg-muted',
              )}
              onClick={() => onCatChange(i)}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EmojiGrid({ emojis, skinTone, onSelect }: { emojis: string[]; skinTone: string; onSelect: (v: string) => void }) {
  return (
    <div className="mb-1 grid grid-cols-8 gap-1">
      {emojis.map((emoji, i) => {
        const displayed = applyTone(emoji, skinTone)
        return (
          <button
            key={`${emoji}-${i}`}
            type="button"
            className="flex size-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-muted"
            onClick={() => onSelect(emoji)}
          >
            {displayed}
          </button>
        )
      })}
    </div>
  )
}

// ─── icon pane ────────────────────────────────────────────────────────────────

function IconPane({
  search, catIndex, recents, color, onSearch, onSelect, onPick, onCatChange,
}: {
  search: string
  catIndex: number | null
  recents: string[]
  color: string
  onSearch: (v: string) => void
  onSelect: (v: string) => void
  onPick: (name: string) => void
  onCatChange: (i: number | null) => void
}) {
  const isAll = catIndex === null
  const q = search.trim().toLowerCase()
  const searchResults = q ? LUCIDE_ICONS.filter((e) => e.name.includes(q)) : null

  const handleSelect = (name: string) => onSelect(buildLucideIconValue(name, color))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          placeholder="Filtrar por nome..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          title="Aleatório"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => onPick(LUCIDE_ICONS[Math.floor(Math.random() * LUCIDE_ICONS.length)].name)}
        >
          <LuDices className="size-3.5" />
        </button>
      </div>
      <div className="h-48 overflow-y-auto">
        {searchResults ? (
          searchResults.length > 0
            ? <IconGrid entries={searchResults} color={color} onSelect={handleSelect} />
            : <p className="py-6 text-center text-xs text-muted-foreground">Nenhum resultado.</p>
        ) : isAll ? (
          <>
            {recents.length > 0 && (
              <>
                <SectionLabel label="Recentes" />
                <IconGrid
                  entries={LUCIDE_ICONS.filter((e) => recents.includes(buildLucideIconValue(e.name, color)))}
                  color={color}
                  onSelect={handleSelect}
                />
              </>
            )}
            {ICON_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <SectionLabel label={cat.label} />
                <IconGrid entries={cat.icons} color={color} onSelect={handleSelect} />
              </div>
            ))}
          </>
        ) : (
          <>
            <SectionLabel label={ICON_CATEGORIES[catIndex].label} />
            <IconGrid entries={ICON_CATEGORIES[catIndex].icons} color={color} onSelect={handleSelect} />
          </>
        )}
      </div>
      {!q && (
        <div className="flex items-center justify-between border-t pt-1.5">
          <button
            type="button"
            title="Todos"
            className={cn(
              'flex size-7 items-center justify-center rounded-md transition-colors',
              isAll ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            onClick={() => onCatChange(null)}
          >
            <LuGrid3X3 className="size-3.5" />
          </button>
          {ICON_CATEGORIES.map((cat, i) => {
            const First = cat.icons[0].icon
            return (
              <button
                key={cat.label}
                type="button"
                title={cat.label}
                className={cn(
                  'flex size-7 items-center justify-center rounded-md transition-colors',
                  catIndex === i ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                onClick={() => onCatChange(i)}
              >
                <First className="size-3.5" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function IconGrid({
  entries, color, onSelect,
}: {
  entries: { name: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }[]
  color: string
  onSelect: (name: string) => void
}) {
  return (
    <div className="mb-1 grid grid-cols-8 gap-1">
      {entries.map((entry) => {
        const Icon = entry.icon
        return (
          <button
            key={entry.name}
            type="button"
            title={entry.name}
            className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-muted"
            onClick={() => onSelect(entry.name)}
          >
            <Icon className="size-4" style={{ color }} />
          </button>
        )
      })}
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="mb-1 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
  )
}
