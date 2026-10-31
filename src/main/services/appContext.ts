import type { Settings } from '@shared/types'
import type { JobManager } from '../jobs/jobManager'
import type { Repositories } from '../store/repositories'
import type { SelectionContext } from '../domain/selection'
import { poorlyRatedQuestionIds } from '../domain/feedbackSelection'

export interface AppContext {
  settings(): Settings
  repositories(): Repositories
  jobs: JobManager
  notifyDataChanged(): void
}

export function buildSelectionContext(repositories: Repositories): SelectionContext {
  return {
    questions: repositories.questions.readAll(),
    attempts: repositories.attempts.readAll(),
    poorlyRatedQuestionIds: poorlyRatedQuestionIds(repositories.feedback.readAll()),
  }
}
