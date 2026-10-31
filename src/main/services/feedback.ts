import type { Feedback } from '@shared/types'
import type { AuthoringFeedbackInput, QuestionFeedbackInput } from '@shared/api'
import { newId } from '../store/repositories'
import type { AppContext } from './appContext'

function saveNew(context: AppContext, fields: Omit<Feedback, 'id' | 'active' | 'createdAt'>): void {
  context.repositories().saveFeedback({ ...fields, id: newId('f'), active: true, createdAt: new Date().toISOString() })
  context.notifyDataChanged()
}

/** A reported rubric error sends the question back to review so it is not trusted until checked. */
export function addQuestionFeedback(context: AppContext, input: QuestionFeedbackInput): void {
  const repositories = context.repositories()
  const question = repositories.requireQuestion(input.questionId)
  if (input.reasons.includes('rubric-error')) repositories.saveQuestion({ ...question, reviewStatus: 'unreviewed' })
  saveNew(context, {
    kind: 'question',
    questionId: input.questionId,
    rating: input.rating,
    reasons: input.reasons,
    comment: input.comment.trim(),
    scope: { topic: question.topic, category: question.category },
  })
}

export function addAuthoringFeedback(context: AppContext, input: AuthoringFeedbackInput): void {
  if (!input.comment.trim()) throw new Error('피드백 내용을 입력하세요.')
  saveNew(context, { kind: 'authoring', questionId: null, rating: null, reasons: [], comment: input.comment.trim(), scope: input.scope })
}

export function setFeedbackActive(context: AppContext, id: string, active: boolean): void {
  const repositories = context.repositories()
  const feedback = repositories.feedback.read(id)
  if (!feedback) throw new Error('피드백을 찾을 수 없습니다.')
  repositories.saveFeedback({ ...feedback, active })
  context.notifyDataChanged()
}
