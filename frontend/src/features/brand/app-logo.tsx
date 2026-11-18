import { cn } from '@/lib/utils'
import godardStackLogo from '@/assets/godard-stack-logo.svg'
import carnivalHat from '@/assets/event-hats/minimal/carnival-hat.svg'
import juninaHat from '@/assets/event-hats/minimal/junina-hat.svg'
import birthdayHat from '@/assets/event-hats/minimal/birthday-hat.svg'
import halloweenHat from '@/assets/event-hats/minimal/halloween-hat.svg'
import christmasHat from '@/assets/event-hats/minimal/christmas-classic-hat.svg'
import newYearHat from '@/assets/event-hats/minimal/new-year-hat.svg'

type SeasonalEvent = 'carnival' | 'junina' | 'birthday' | 'halloween' | 'christmas' | 'new-year'

const HATS: Record<SeasonalEvent, string> = {
  carnival: carnivalHat,
  junina: juninaHat,
  birthday: birthdayHat,
  halloween: halloweenHat,
  christmas: christmasHat,
  'new-year': newYearHat,
}

function dayOf(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function isWithinSeason(date: Date, eventDate: Date) {
  const currentDay = dayOf(date).getTime()
  return currentDay >= addDays(eventDate, -3).getTime() && currentDay <= addDays(eventDate, 3).getTime()
}

function easterSunday(year: number) {
  const goldenNumber = year % 19
  const century = Math.floor(year / 100)
  const yearOfCentury = year % 100
  const leapCenturies = Math.floor(century / 4)
  const centuryRemainder = century % 4
  const correction = Math.floor((century + 8) / 25)
  const moonCorrection = Math.floor((century - correction + 1) / 3)
  const epact = (19 * goldenNumber + century - leapCenturies - moonCorrection + 15) % 30
  const leapYears = Math.floor(yearOfCentury / 4)
  const weekdayRemainder = yearOfCentury % 4
  const weekdayOffset = (32 + 2 * centuryRemainder + 2 * leapYears - epact - weekdayRemainder) % 7
  const adjustment = Math.floor((goldenNumber + 11 * epact + 22 * weekdayOffset) / 451)
  const month = Math.floor((epact + weekdayOffset - 7 * adjustment + 114) / 31) - 1
  const day = (epact + weekdayOffset - 7 * adjustment + 114) % 31 + 1
  return new Date(year, month, day)
}

export function getSeasonalEvent(date = new Date()): SeasonalEvent | null {
  const currentDay = dayOf(date)
  const year = currentDay.getFullYear()
  const carnivalTuesday = addDays(easterSunday(year), -47)

  if (isWithinSeason(currentDay, carnivalTuesday)) return 'carnival'
  if (isWithinSeason(currentDay, new Date(year, 5, 24))) return 'junina'
  if (isWithinSeason(currentDay, new Date(year, 7, 21))) return 'birthday'
  if (isWithinSeason(currentDay, new Date(year, 9, 31))) return 'halloween'
  if (isWithinSeason(currentDay, new Date(year, 11, 25))) return 'christmas'
  if (isWithinSeason(currentDay, new Date(year, 0, 1)) || isWithinSeason(currentDay, new Date(year + 1, 0, 1))) return 'new-year'

  return null
}

type AppLogoProps = {
  className?: string
  showHat?: boolean
}

export function AppLogo({ className, showHat = true }: AppLogoProps) {
  const seasonalEvent = getSeasonalEvent()
  const hatPosition = 'left-[45%] top-[-35%] w-[135%] -translate-x-1/2 -rotate-8'

  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-flex size-8 shrink-0 items-center justify-center', className)}
    >
      <img src={godardStackLogo} alt="" className="size-full object-contain" />
      {showHat && seasonalEvent && (
        <img
          src={HATS[seasonalEvent]}
          alt=""
          className={cn('pointer-events-none absolute max-w-none transform-gpu', hatPosition)}
        />
      )}
    </span>
  )
}
