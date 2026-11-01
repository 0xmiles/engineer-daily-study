import type { StreakView } from '@shared/api'
import { localDateKey } from '../domain/dates'
import { computeStreak, studyActivityDates } from '../domain/streak'
import type { Repositories } from '../store/repositories'

export function getStreak(repositories: Repositories): StreakView {
  const activityDates = studyActivityDates(repositories.attempts.readAll(), repositories.interviews.readAll())
  return computeStreak(activityDates, localDateKey(new Date()))
}
