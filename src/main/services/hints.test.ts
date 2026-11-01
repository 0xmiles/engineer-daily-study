import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GradingResult, Question } from '@shared/types'
import type { AppContext } from './appContext'
import { addDays } from '../domain/dates'
import { createAttempt, startDailyAttempt, todayKey } from './daily'
import { submitAttempt } from './grading'
import { listPostponed, postponeAttempt, requestHint, startRetry } from './hints'
import { createTestAppContext, questionContentFor, removeTestDataDirectories } from './testAppContext'

const { runSkill } = vi.hoisted(() => ({ runSkill: vi.fn() }))
vi.mock('../llm/skillRunner', async () => {
  const { CancelledError } = await import('../llm/processRunner')
  return { CancelledError, RunnerError: class extends Error {}, runSkill }
})

const PERFECT_GRADING: GradingResult = {
  requiredCoverage: [{ point: 'a', status: 'full', comment: '' }],
  bonusMatched: [],
  deductionsApplied: [],
  perspectiveScores: [{ perspective: 'p', score: 10, comment: '' }],
  strengths: [], weaknesses: [], studyRecommendations: [], overallComment: '',
}

/** Fake grader: numbered hints in hint mode, a perfect grading otherwise. */
function graderAnswering() {
  let hintCount = 0
  runSkill.mockReset().mockImplementation(async ({ schema }: { schema: string }) => (schema === 'hint' ? { hint: `hint ${++hintCount}` } : PERFECT_GRADING))
}

function saveQuestion(context: AppContext): Question {
  const content = questionContentFor({ format: 'scenario', category: 'code-review', topic: 'kafka', difficulty: 'middle' }, 'Question')
  const question: Question = {
    ...content,
    rubric: { ...content.rubric, required: [{ point: 'a', explanation: '' }] },
    id: 'q-1', source: 'seed', reviewStatus: 'reviewed', createdAt: '2026-10-01T00:00:00Z', variantOf: null, servedAt: '2026-10-01T00:00:00Z',
  }
  context.repositories().saveQuestion(question)
  return question
}

async function waitForJobs(context: AppContext): Promise<void> {
  await vi.waitFor(() => {
    if (context.jobs.hasRunningJobs()) throw new Error('still running')
  })
}

async function attemptWithHints(context: AppContext, hintCount: number): Promise<string> {
  const attemptId = createAttempt(context.repositories(), saveQuestion(context), 'daily').id
  for (let index = 0; index < hintCount; index++) {
    requestHint(context, attemptId, `draft ${index}`)
    await waitForJobs(context)
  }
  return attemptId
}

afterEach(removeTestDataDirectories)

describe('requestHint', () => {
  it('saves the draft, then adds hints with increasing levels up to the limit', async () => {
    graderAnswering()
    const context = createTestAppContext()

    const attemptId = await attemptWithHints(context, 3)

    const attempt = context.repositories().requireAttempt(attemptId)
    expect(attempt.answer).toBe('draft 2')
    expect(attempt.hints?.map((hint) => [hint.level, hint.text])).toEqual([[1, 'hint 1'], [2, 'hint 2'], [3, 'hint 3']])
    expect(runSkill.mock.calls.at(-1)![0].payload).toMatchObject({ mode: 'hint', level: 3, previousHints: ['hint 1', 'hint 2'], answer: 'draft 2' })
    expect(() => requestHint(context, attemptId, 'more')).toThrow('3번까지만')
  })

  it('drops a hint that arrives after the answer was submitted', async () => {
    graderAnswering()
    const context = createTestAppContext()
    const attemptId = createAttempt(context.repositories(), saveQuestion(context), 'daily').id

    requestHint(context, attemptId, 'draft')
    submitAttempt(context, attemptId, 'final answer')
    await waitForJobs(context)

    const attempt = context.repositories().requireAttempt(attemptId)
    expect(attempt.hints ?? []).toEqual([])
    expect(context.jobs.list().find((job) => job.kind === 'hint')?.status).toBe('failed')
  })
})

describe('grading with hints', () => {
  it('takes 5 points off the total for each hint', async () => {
    // Full required coverage and perspectives without bonus items grade to 90 before hints.
    graderAnswering()
    const context = createTestAppContext()
    const attemptId = await attemptWithHints(context, 2)

    submitAttempt(context, attemptId, 'final answer')
    await waitForJobs(context)

    expect(context.repositories().requireAttempt(attemptId).grading).toMatchObject({ totalScore: 80, hintPenalty: 10 })
  })
})

describe('postponeAttempt', () => {
  it('is only possible after every hint was used', async () => {
    graderAnswering()
    const context = createTestAppContext()
    const attemptId = await attemptWithHints(context, 2)

    expect(() => postponeAttempt(context, attemptId, 'stuck')).toThrow('모두 받은 뒤')
  })

  it('keeps the draft and schedules the question three days later', async () => {
    graderAnswering()
    const context = createTestAppContext()
    const attemptId = await attemptWithHints(context, 3)

    postponeAttempt(context, attemptId, 'stuck here')

    expect(context.repositories().requireAttempt(attemptId)).toMatchObject({ status: 'postponed', answer: 'stuck here', retryOn: addDays(todayKey(), 3), retryAttemptId: null })
    expect(listPostponed(context.repositories()).map((entry) => entry.attempt.id)).toEqual([attemptId])
  })
})

describe('startRetry', () => {
  it('creates the retry attempt once, and the daily retry item reuses it', async () => {
    graderAnswering()
    const context = createTestAppContext()
    const postponedId = await attemptWithHints(context, 3)
    postponeAttempt(context, postponedId, 'stuck')

    const retryId = startRetry(context, postponedId)
    const today = todayKey()
    context.repositories().saveDailySet({
      date: today,
      items: [{ kind: 'retry', questionId: 'q-1', spec: { format: 'scenario', difficulty: 'middle' }, variantOfAttemptId: null, retryOfAttemptId: postponedId, attemptId: null, generationError: null }],
    })

    expect(startRetry(context, postponedId)).toBe(retryId)
    expect(startDailyAttempt(context, today, 0)).toBe(retryId)
    const retry = context.repositories().requireAttempt(retryId)
    expect(retry).toMatchObject({ status: 'draft', questionId: 'q-1' })
    expect(retry.hints).toBeUndefined()
    expect(listPostponed(context.repositories())).toEqual([])
  })
})
