import type { Attempt, FollowUp, FollowUpEvaluation, Inquiry, Question } from '@shared/types'
import { MAX_FOLLOW_UPS } from '@shared/rules'
import type { JobContext } from '../jobs/jobManager'
import { runSkill } from '../llm/skillRunner'
import type { SchemaName } from '../llm/resources'
import { newId, type Repositories } from '../store/repositories'
import type { AppContext } from './appContext'
import { graderQuestion } from './grading'

const QUESTIONS_PER_ROUND = 2
const MAX_TEXT_LENGTH = 4000
const INTERRUPTED_MESSAGE = '앱이 종료되어 중단되었습니다. 다시 시도해 주세요.'
const CANCELLED_MESSAGE = '작업을 취소했습니다. 다시 시도할 수 있습니다.'

interface FollowUpQuestions {
  questions: { question: string; focus: string }[]
}

interface InquiryAnswer {
  answer: string
}

function followUpsOf(attempt: Attempt): FollowUp[] {
  return attempt.followUps ?? []
}

function inquiriesOf(attempt: Attempt): Inquiry[] {
  return attempt.inquiries ?? []
}

function assertGraded(attempt: Attempt): void {
  if (attempt.status !== 'graded' || !attempt.grading) throw new Error('채점이 끝난 풀이에서만 할 수 있습니다.')
}

function requireGradedAttempt(repositories: Repositories, attemptId: string): Attempt {
  const attempt = repositories.requireAttempt(attemptId)
  assertGraded(attempt)
  return attempt
}

function requireFollowUp(attempt: Attempt, followUpId: string): FollowUp {
  const followUp = followUpsOf(attempt).find((entry) => entry.id === followUpId)
  if (!followUp) throw new Error('꼬리 질문을 찾을 수 없습니다.')
  return followUp
}

function requireInquiry(attempt: Attempt, inquiryId: string): Inquiry {
  const inquiry = inquiriesOf(attempt).find((entry) => entry.id === inquiryId)
  if (!inquiry) throw new Error('질문을 찾을 수 없습니다.')
  return inquiry
}

function requireText(text: string, emptyMessage: string): string {
  const trimmed = text.trim()
  if (!trimmed) throw new Error(emptyMessage)
  if (trimmed.length > MAX_TEXT_LENGTH) throw new Error(`${MAX_TEXT_LENGTH}자 이하로 입력하세요.`)
  return trimmed
}

function isAwaitingEvaluation(followUp: FollowUp): boolean {
  return followUp.answer !== null && followUp.evaluation === null && !followUp.evaluationError
}

function isAwaitingAnswer(inquiry: Inquiry): boolean {
  return inquiry.answer === null && !inquiry.error
}

/** The grading as the grader wrote it plus the final score; timestamps and runner do not help it reason. */
function discussionPayload(question: Question, attempt: Attempt): object {
  const { gradedAt: _gradedAt, runner: _runner, hintPenalty: _hintPenalty, ...grading } = attempt.grading!
  return { question: graderQuestion(question), answer: attempt.answer, grading }
}

function runGrader<T>(context: AppContext, job: JobContext, schema: SchemaName, payload: object): Promise<T> {
  return runSkill<T>({ skill: 'daily-study-grader', schema, payload, settings: context.settings(), signal: job.signal, onStage: job.setStage })
}

/** Follow-ups come in rounds: the next round waits until every earlier question is answered and evaluated. */
function nextRoundSize(attempt: Attempt): number {
  const followUps = followUpsOf(attempt)
  const remaining = MAX_FOLLOW_UPS - followUps.length
  if (remaining <= 0) throw new Error(`꼬리 질문은 ${MAX_FOLLOW_UPS}개까지 받을 수 있습니다.`)
  if (followUps.some((followUp) => followUp.evaluation === null)) throw new Error('앞선 꼬리 질문에 모두 답하고 평가를 받은 뒤에 다음 질문을 받을 수 있습니다.')
  return Math.min(QUESTIONS_PER_ROUND, remaining)
}

function previousFollowUps(attempt: Attempt): object[] {
  return followUpsOf(attempt).map(({ question, focus, answer, evaluation }) => ({ question, focus, answer, evaluation }))
}

function saveFollowUps(repositories: Repositories, attemptId: string, generated: FollowUpQuestions['questions']): void {
  repositories.updateAttempt(attemptId, (attempt) => {
    assertGraded(attempt)
    const createdAt = new Date().toISOString()
    const added = generated
      .filter((entry) => entry.question.trim())
      .slice(0, nextRoundSize(attempt))
      .map((entry): FollowUp => ({
        id: newId('fu'), question: entry.question.trim(), focus: entry.focus.trim(), createdAt,
        answer: null, answeredAt: null, evaluation: null, evaluationError: null,
      }))
    if (added.length === 0) throw new Error('꼬리 질문을 만들지 못했습니다. 다시 시도해 주세요.')
    return { followUps: [...followUpsOf(attempt), ...added] }
  })
}

export function requestFollowUps(context: AppContext, attemptId: string): string {
  const repositories = context.repositories()
  if (context.jobs.isRunningFor('follow-up-questions', attemptId)) throw new Error('꼬리 질문을 만드는 중입니다. 잠시 기다려 주세요.')
  const attempt = requireGradedAttempt(repositories, attemptId)
  nextRoundSize(attempt)
  const question = repositories.requireQuestion(attempt.questionId)
  return context.jobs.start('follow-up-questions', `꼬리 질문: ${question.title}`, async (job) => {
    job.setTarget(attemptId)
    const current = requireGradedAttempt(context.repositories(), attemptId)
    const result = await runGrader<FollowUpQuestions>(context, job, 'follow-up-questions', {
      mode: 'follow-up-questions',
      ...discussionPayload(question, current),
      previousFollowUps: previousFollowUps(current),
      count: nextRoundSize(current),
    })
    saveFollowUps(context.repositories(), attemptId, result.questions)
  }, { onSucceeded: context.notifyDataChanged })
}

function updateFollowUp(repositories: Repositories, attemptId: string, followUpId: string, changes: Partial<FollowUp>): void {
  repositories.updateAttempt(attemptId, (attempt) => {
    requireFollowUp(attempt, followUpId)
    return { followUps: followUpsOf(attempt).map((entry) => (entry.id === followUpId ? { ...entry, ...changes } : entry)) }
  })
}

function failFollowUpEvaluation(context: AppContext, attemptId: string, followUpId: string, message: string): void {
  updateFollowUp(context.repositories(), attemptId, followUpId, { evaluationError: message })
  context.notifyDataChanged()
}

function startEvaluationJob(context: AppContext, attemptId: string, followUpId: string): string {
  const repositories = context.repositories()
  const question = repositories.requireQuestion(repositories.requireAttempt(attemptId).questionId)
  return context.jobs.start('follow-up-evaluation', `꼬리 질문 평가: ${question.title}`, async (job) => {
    job.setTarget(attemptId)
    const attempt = requireGradedAttempt(context.repositories(), attemptId)
    const followUp = requireFollowUp(attempt, followUpId)
    const evaluation = await runGrader<FollowUpEvaluation>(context, job, 'follow-up-evaluation', {
      mode: 'follow-up-evaluation',
      ...discussionPayload(question, attempt),
      followUp: { question: followUp.question, focus: followUp.focus },
      followUpAnswer: followUp.answer,
    })
    updateFollowUp(context.repositories(), attemptId, followUpId, { evaluation, evaluationError: null })
  }, {
    onSucceeded: context.notifyDataChanged,
    onFailed: (message) => failFollowUpEvaluation(context, attemptId, followUpId, message),
    onCancelled: () => failFollowUpEvaluation(context, attemptId, followUpId, CANCELLED_MESSAGE),
  })
}

/** The answer is saved before evaluating, so a failed evaluation never loses what the user wrote. */
export function answerFollowUp(context: AppContext, attemptId: string, followUpId: string, answer: string): string {
  const text = requireText(answer, '답을 입력하세요.')
  context.repositories().updateAttempt(attemptId, (attempt) => {
    assertGraded(attempt)
    if (requireFollowUp(attempt, followUpId).answer !== null) throw new Error('이미 답한 꼬리 질문입니다.')
    const changes: Partial<FollowUp> = { answer: text, answeredAt: new Date().toISOString(), evaluationError: null }
    return { followUps: followUpsOf(attempt).map((entry) => (entry.id === followUpId ? { ...entry, ...changes } : entry)) }
  })
  context.notifyDataChanged()
  return startEvaluationJob(context, attemptId, followUpId)
}

/** Only a failed evaluation can be retried; one without an error is still running. */
export function retryFollowUpEvaluation(context: AppContext, attemptId: string, followUpId: string): string {
  const followUp = requireFollowUp(requireGradedAttempt(context.repositories(), attemptId), followUpId)
  if (followUp.answer === null || followUp.evaluation !== null || !followUp.evaluationError) throw new Error('평가에 실패한 꼬리 질문만 다시 평가할 수 있습니다.')
  updateFollowUp(context.repositories(), attemptId, followUpId, { evaluationError: null })
  context.notifyDataChanged()
  return startEvaluationJob(context, attemptId, followUpId)
}

function updateInquiry(repositories: Repositories, attemptId: string, inquiryId: string, changes: Partial<Inquiry>): void {
  repositories.updateAttempt(attemptId, (attempt) => {
    requireInquiry(attempt, inquiryId)
    return { inquiries: inquiriesOf(attempt).map((entry) => (entry.id === inquiryId ? { ...entry, ...changes } : entry)) }
  })
}

function failInquiry(context: AppContext, attemptId: string, inquiryId: string, message: string): void {
  updateInquiry(context.repositories(), attemptId, inquiryId, { error: message })
  context.notifyDataChanged()
}

/** Earlier answered questions go along so the grader can follow the conversation. */
function previousInquiries(attempt: Attempt, inquiryId: string): object[] {
  const inquiries = inquiriesOf(attempt)
  return inquiries
    .slice(0, inquiries.findIndex((entry) => entry.id === inquiryId))
    .filter((entry) => entry.answer !== null)
    .map(({ question, answer }) => ({ question, answer }))
}

function startInquiryJob(context: AppContext, attemptId: string, inquiryId: string): string {
  const repositories = context.repositories()
  const question = repositories.requireQuestion(repositories.requireAttempt(attemptId).questionId)
  return context.jobs.start('inquiry', `감독관에게 질문: ${question.title}`, async (job) => {
    job.setTarget(attemptId)
    const attempt = requireGradedAttempt(context.repositories(), attemptId)
    const inquiry = requireInquiry(attempt, inquiryId)
    const result = await runGrader<InquiryAnswer>(context, job, 'inquiry-answer', {
      mode: 'inquiry',
      ...discussionPayload(question, attempt),
      previousInquiries: previousInquiries(attempt, inquiryId),
      userQuestion: inquiry.question,
    })
    updateInquiry(context.repositories(), attemptId, inquiryId, { answer: result.answer, answeredAt: new Date().toISOString(), error: null })
  }, {
    onSucceeded: context.notifyDataChanged,
    onFailed: (message) => failInquiry(context, attemptId, inquiryId, message),
    onCancelled: () => failInquiry(context, attemptId, inquiryId, CANCELLED_MESSAGE),
  })
}

/** One question at a time, so each answer can build on the one before it. */
export function askInquiry(context: AppContext, attemptId: string, question: string): string {
  const text = requireText(question, '질문을 입력하세요.')
  const inquiry: Inquiry = { id: newId('iq'), question: text, askedAt: new Date().toISOString(), answer: null, answeredAt: null, error: null }
  context.repositories().updateAttempt(attemptId, (attempt) => {
    assertGraded(attempt)
    if (inquiriesOf(attempt).some(isAwaitingAnswer)) throw new Error('앞선 질문의 답을 기다리는 중입니다. 답이 온 뒤에 다시 질문하세요.')
    return { inquiries: [...inquiriesOf(attempt), inquiry] }
  })
  context.notifyDataChanged()
  return startInquiryJob(context, attemptId, inquiry.id)
}

export function retryInquiry(context: AppContext, attemptId: string, inquiryId: string): string {
  const inquiry = requireInquiry(requireGradedAttempt(context.repositories(), attemptId), inquiryId)
  if (inquiry.answer !== null || !inquiry.error) throw new Error('답을 받지 못한 질문만 다시 요청할 수 있습니다.')
  updateInquiry(context.repositories(), attemptId, inquiryId, { error: null })
  context.notifyDataChanged()
  return startInquiryJob(context, attemptId, inquiryId)
}

/** Discussion jobs live in memory, so anything still waiting from a previous run would wait forever without an error. */
export function recoverInterruptedDiscussions(repositories: Repositories): void {
  for (const attempt of repositories.attempts.readAll()) {
    const hasPendingFollowUp = followUpsOf(attempt).some(isAwaitingEvaluation)
    const hasPendingInquiry = inquiriesOf(attempt).some(isAwaitingAnswer)
    if (!hasPendingFollowUp && !hasPendingInquiry) continue
    repositories.saveAttempt({
      ...attempt,
      followUps: attempt.followUps?.map((entry) => (isAwaitingEvaluation(entry) ? { ...entry, evaluationError: INTERRUPTED_MESSAGE } : entry)),
      inquiries: attempt.inquiries?.map((entry) => (isAwaitingAnswer(entry) ? { ...entry, error: INTERRUPTED_MESSAGE } : entry)),
    })
  }
}
