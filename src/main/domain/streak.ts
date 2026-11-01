import type { Attempt, Interview } from '@shared/types'
import type { StreakView, StudyDay } from '@shared/api'
import { addDays, localDateKey } from './dates'

export const HEATMAP_DAYS = 18 * 7

/** Submitted attempts and finished conversation interviews, each as the local date it happened on. */
export function studyActivityDates(attempts: Attempt[], interviews: Interview[]): string[] {
  const attemptDates = attempts
    .filter((attempt) => attempt.submittedAt && attempt.status !== 'draft' && attempt.status !== 'postponed')
    .map((attempt) => localDateKey(new Date(attempt.submittedAt!)))
  const interviewDates = interviews
    .filter((interview) => interview.mode === 'conversation' && interview.status === 'completed' && interview.completedAt)
    .map((interview) => localDateKey(new Date(interview.completedAt!)))
  return [...attemptDates, ...interviewDates]
}

function countByDate(activityDates: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const date of activityDates) counts.set(date, (counts.get(date) ?? 0) + 1)
  return counts
}

function consecutiveDaysEndingOn(studied: Set<string>, lastDay: string): number {
  let count = 0
  for (let day = lastDay; studied.has(day); day = addDays(day, -1)) count++
  return count
}

function longestRun(studied: Set<string>): number {
  let longest = 0
  for (const day of studied) {
    // Only a run's first day starts a count, so each run is walked once.
    if (studied.has(addDays(day, -1))) continue
    let length = 0
    for (let next = day; studied.has(next); next = addDays(next, 1)) length++
    longest = Math.max(longest, length)
  }
  return longest
}

/** A streak stays alive through today until midnight, so it counts back from yesterday while today is still empty. */
export function computeStreak(activityDates: string[], today: string, heatmapDays = HEATMAP_DAYS): StreakView {
  const counts = countByDate(activityDates)
  const studied = new Set(counts.keys())
  const studiedToday = studied.has(today)
  const days: StudyDay[] = Array.from({ length: heatmapDays }, (_, index) => {
    const date = addDays(today, index - heatmapDays + 1)
    return { date, count: counts.get(date) ?? 0 }
  })
  return {
    current: consecutiveDaysEndingOn(studied, studiedToday ? today : addDays(today, -1)),
    longest: longestRun(studied),
    studiedToday,
    days,
  }
}
