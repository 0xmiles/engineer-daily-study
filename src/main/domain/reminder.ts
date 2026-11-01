import type { StreakView } from '@shared/api'

function reminderTimeOn(reminderTime: string, day: Date): Date {
  const [hours, minutes] = reminderTime.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes)
}

export function isReminderTimePassed(reminderTime: string, now: Date): boolean {
  return reminderTimeOn(reminderTime, now).getTime() <= now.getTime()
}

/** Time until the reminder's next local HH:MM: later today, or tomorrow once today's has passed. */
export function millisecondsUntilReminder(reminderTime: string, now: Date): number {
  const next = reminderTimeOn(reminderTime, now)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

/** Null when nothing is left for today, so a finished day gets no notification. */
export function reminderBody(pendingCount: number, streak: Pick<StreakView, 'current' | 'studiedToday'>): string | null {
  if (pendingCount === 0) return null
  const pending = `아직 풀지 않은 오늘의 문제가 ${pendingCount}개 있습니다.`
  if (streak.current === 0 || streak.studiedToday) return pending
  return `${pending} 연속 ${streak.current}일째 공부하고 있습니다. 오늘 문제를 풀면 ${streak.current + 1}일이 됩니다.`
}
