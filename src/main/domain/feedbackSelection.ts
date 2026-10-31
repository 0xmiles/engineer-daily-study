import type { Feedback, Question, QuestionSpec } from '@shared/types'
import { FEEDBACK_REASONS } from '@shared/taxonomy'

const MAX_FEEDBACK_FOR_AUTHORING = 20

export interface AuthoringGuideline {
  createdAt: string
  appliesTo: string
  guideline: string
}

function scopeMatches(feedback: Feedback, spec: QuestionSpec): boolean {
  const { format, category, topic, difficulty } = feedback.scope
  return (
    (!format || format === spec.format) &&
    (!category || category === spec.category) &&
    (!topic || topic === spec.topic) &&
    (!difficulty || difficulty === spec.difficulty)
  )
}

function questionFeedbackMatches(question: Question | undefined, spec: QuestionSpec): boolean {
  if (!question) return false
  return question.topic === spec.topic || question.category === spec.category
}

function describeQuestionFeedback(feedback: Feedback, question: Question): string {
  const reasons = feedback.reasons.map((reason) => FEEDBACK_REASONS.find((entry) => entry.value === reason)?.label ?? reason)
  const rating = feedback.rating === 'good' ? '좋았음' : '아쉬움'
  return `문제 "${question.title}" 에 대한 평가: ${rating}. 사유: ${reasons.join(', ') || '없음'}. 의견: ${feedback.comment || '없음'}`
}

/** Active feedback relevant to the spec, newest first, rendered as guidelines for the question author skill. */
export function selectAuthoringGuidelines(feedbacks: Feedback[], questions: Question[], spec: QuestionSpec): AuthoringGuideline[] {
  const questionsById = new Map(questions.map((question) => [question.id, question]))
  return feedbacks
    .filter((feedback) => feedback.active)
    .filter((feedback) =>
      feedback.kind === 'authoring'
        ? scopeMatches(feedback, spec)
        : questionFeedbackMatches(questionsById.get(feedback.questionId ?? ''), spec),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_FEEDBACK_FOR_AUTHORING)
    .map((feedback) => ({
      createdAt: feedback.createdAt,
      appliesTo: feedback.kind === 'authoring' ? '출제 방식 전체 또는 지정 범위' : '비슷한 문제',
      guideline:
        feedback.kind === 'authoring'
          ? feedback.comment
          : describeQuestionFeedback(feedback, questionsById.get(feedback.questionId ?? '')!),
    }))
}

export function poorlyRatedQuestionIds(feedbacks: Feedback[]): Set<string> {
  return new Set(
    feedbacks
      .filter((feedback) => feedback.active && feedback.kind === 'question' && feedback.rating === 'poor')
      .map((feedback) => feedback.questionId!)
  )
}
