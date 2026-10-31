const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/** Local calendar date as YYYY-MM-DD, so the daily set flips at the user's midnight. */
export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + days)
  return localDateKey(date)
}

export function daysBetween(fromDateKey: string, toDateKey: string): number {
  return Math.round((parseDateKey(toDateKey).getTime() - parseDateKey(fromDateKey).getTime()) / MILLISECONDS_PER_DAY)
}
