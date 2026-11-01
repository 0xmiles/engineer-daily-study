import type { Attempt, Hint, Question } from '@shared/types'
import type { HistoryEntry } from '@shared/api'
import { MAX_HINTS, POSTPONE_DAYS } from '@shared/rules'
import { addDays } from '../domain/dates'
import { runSkill } from '../llm/skillRunner'
import type { Repositories } from '../store/repositories'
import type { AppContext } from './appContext'
import { startRetryAttempt, todayKey } from './daily'
import { graderQuestion } from './grading'
import { saveDraft } from './questionBank'

interface HintResult {
  hint: string
}

function hintsOf(attempt: Attempt): Hint[] {
  return attempt.hints ?? []
}

function requireHintableAttempt(repositories: Repositories, attemptId: string): Attempt {
  const attempt = repositories.requireAttempt(attemptId)
  if (attempt.status !== 'draft') throw new Error('제출한 답안에는 힌트를 받을 수 없습니다.')
  if (attempt.origin === 'interview') throw new Error('모의 면접에서는 힌트를 받을 수 없습니다.')
  if (hintsOf(attempt).length >= MAX_HINTS) throw new Error(`힌트는 ${MAX_HINTS}번까지만 받을 수 있습니다.`)
  return attempt
}

/** Each level gives away more, and the grader sees the draft so the hint points at what is still missing. */
function hintPayload(question: Question, attempt: Attempt): object {
  return {
    mode: 'hint',
    question: graderQuestion(question),
    answer: attempt.answer,
    previousHints: hintsOf(attempt).map((hint) => hint.text),
    level: hintsOf(attempt).length + 1,
  }
}

/** A hint that arrives after the answer was submitted would only cost points, so it is dropped. */
function saveHint(repositories: Repositories, attemptId: string, text: string): void {
  repositories.updateAttempt(attemptId, (attempt) => {
    if (attempt.status !== 'draft') throw new Error('힌트가 오기 전에 답안을 제출해서 힌트를 저장하지 않았습니다.')
    const hints = hintsOf(attempt)
    return { hints: [...hints, { level: hints.length + 1, text, createdAt: new Date().toISOString() }] }
  })
}

/** Saves the draft first so the hint is based on what the user has written so far. */
export function requestHint(context: AppContext, attemptId: string, answer: string): string {
  const repositories = context.repositories()
  if (context.jobs.isRunningFor('hint', attemptId)) throw new Error('힌트를 만드는 중입니다. 잠시 기다려 주세요.')
  requireHintableAttempt(repositories, attemptId)
  saveDraft(context, attemptId, answer)
  const question = repositories.requireQuestion(repositories.requireAttempt(attemptId).questionId)
  return context.jobs.start('hint', `힌트: ${question.title}`, async (job) => {
    job.setTarget(attemptId)
    const attempt = requireHintableAttempt(context.repositories(), attemptId)
    const result = await runSkill<HintResult>({
      skill: 'daily-study-grader',
      schema: 'hint',
      payload: hintPayload(question, attempt),
      settings: context.settings(),
      signal: job.signal,
      onStage: job.setStage,
    })
    saveHint(context.repositories(), attemptId, result.hint)
  }, { onSucceeded: context.notifyDataChanged })
}

/** Only after every hint is used: the draft is kept for reference and the question returns a few days later. */
export function postponeAttempt(context: AppContext, attemptId: string, answer: string): void {
  const repositories = context.repositories()
  const attempt = repositories.requireAttempt(attemptId)
  if (attempt.status !== 'draft') throw new Error('작성 중인 답안만 나중에 다시 풀 수 있습니다.')
  if (hintsOf(attempt).length < MAX_HINTS) throw new Error(`힌트를 ${MAX_HINTS}번 모두 받은 뒤에 나중에 다시 풀 수 있습니다.`)
  const now = new Date().toISOString()
  repositories.saveAttempt({
    ...attempt,
    answer,
    draftSavedAt: now,
    status: 'postponed',
    postponedAt: now,
    retryOn: addDays(todayKey(), POSTPONE_DAYS),
    retryAttemptId: null,
  })
  context.notifyDataChanged()
}

/** Postponed questions not solved again yet, the ones due soonest first. */
export function listPostponed(repositories: Repositories): HistoryEntry[] {
  const questions = new Map(repositories.questions.readAll().map((question) => [question.id, question]))
  return repositories.attempts.readAll()
    .filter((attempt) => attempt.status === 'postponed' && !attempt.retryAttemptId)
    .sort((left, right) => (left.retryOn ?? '').localeCompare(right.retryOn ?? ''))
    .map((attempt) => ({ attempt, question: questions.get(attempt.questionId) ?? null }))
}

export function startRetry(context: AppContext, postponedAttemptId: string): string {
  const attemptId = startRetryAttempt(context.repositories(), postponedAttemptId, 'practice')
  context.notifyDataChanged()
  return attemptId
}
