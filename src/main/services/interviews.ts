import type { Interview } from '@shared/types'
import type { InterviewView } from '@shared/api'
import type { Repositories } from '../store/repositories'
import type { AppContext } from './appContext'
import { abandonConversationInterview } from './conversationInterview'
import { abandonTimedInterview, recoverInterruptedTimedInterview } from './timedInterview'

export { answerConversation, finishConversation, retryConversationTurn, retryInterviewReport, startConversationInterview } from './conversationInterview'
export { beginTimedItem, retryInterviewPreparation, startTimedInterview, submitTimedItem } from './timedInterview'

function toView(repositories: Repositories, interview: Interview): InterviewView {
  if (interview.mode === 'conversation') return interview
  return {
    ...interview,
    items: interview.items.map((item) => ({
      ...item,
      question: item.questionId ? repositories.questions.read(item.questionId) : null,
      attempt: item.attemptId ? repositories.attempts.read(item.attemptId) : null,
    })),
  }
}

export function listInterviews(repositories: Repositories): InterviewView[] {
  return repositories.interviews.readAll()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((interview) => toView(repositories, interview))
}

export function getInterview(repositories: Repositories, id: string): InterviewView | null {
  const interview = repositories.interviews.read(id)
  return interview ? toView(repositories, interview) : null
}

export function abandonInterview(context: AppContext, id: string): void {
  const interview = context.repositories().requireInterview(id)
  if (interview.mode === 'timed') abandonTimedInterview(context, interview)
  else abandonConversationInterview(context, interview)
  context.notifyDataChanged()
}

/**
 * Called on startup: preparation jobs live in memory, so a session left preparing can never finish on its own.
 * Conversation turns need nothing here; the screen offers a retry whenever a reply is missing and no job runs.
 */
export function recoverInterruptedInterviews(repositories: Repositories): void {
  for (const interview of repositories.interviews.readAll()) {
    if (interview.mode === 'timed') recoverInterruptedTimedInterview(repositories, interview)
  }
}
