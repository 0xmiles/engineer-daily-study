import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attempt, Job, Question } from '@shared/types'
import { MAX_FOLLOW_UPS } from '@shared/rules'
import type { AppContext } from './appContext'
import { answerFollowUp, askInquiry, recoverInterruptedDiscussions, requestFollowUps, retryFollowUpEvaluation, retryInquiry } from './followUps'
import { createTestAppContext, questionContentFor, removeTestDataDirectories } from './testAppContext'

const { runSkill } = vi.hoisted(() => ({ runSkill: vi.fn() }))
vi.mock('../llm/skillRunner', async () => {
  const { CancelledError } = await import('../llm/processRunner')
  return { CancelledError, RunnerError: class extends Error {}, runSkill }
})

const EVALUATION = { verdict: 'partial', comment: '근거가 빠졌습니다.', modelAnswer: '멱등 키로 중복을 막습니다.' }

/** Fake grader: numbered follow-up questions, a fixed evaluation and an echoing inquiry answer. */
function graderReturning(overrides: Partial<Record<string, () => unknown>> = {}) {
  let questionNumber = 0
  runSkill.mockReset().mockImplementation(async ({ schema, payload }: { schema: string; payload: { count: number; userQuestion: string } }) => {
    if (overrides[schema]) return overrides[schema]!()
    if (schema === 'follow-up-questions') return { questions: Array.from({ length: 3 }, () => ({ question: `꼬리 질문 ${++questionNumber}`, focus: '멱등성' })) }
    if (schema === 'follow-up-evaluation') return EVALUATION
    return { answer: `답: ${payload.userQuestion}` }
  })
}

function seedGradedAttempt(context: AppContext, changes: Partial<Attempt> = {}): Attempt {
  const repositories = context.repositories()
  const question: Question = {
    ...questionContentFor({ format: 'scenario', category: 'code-review', topic: 'kafka', difficulty: 'middle' }, '중복 발행'),
    id: 'q-1', source: 'seed', reviewStatus: 'reviewed', createdAt: '2026-11-01T00:00:00Z', variantOf: null,
  }
  repositories.saveQuestion(question)
  const attempt: Attempt = {
    id: 'a-1', questionId: question.id, origin: 'practice', date: '2026-11-01', answer: '답안', status: 'graded',
    createdAt: '2026-11-01T00:00:00Z', draftSavedAt: null, submittedAt: '2026-11-01T00:10:00Z', gradingError: null, weaknessFollowUps: 0,
    grading: {
      requiredCoverage: [], bonusMatched: [], deductionsApplied: [], perspectiveScores: [], strengths: [], weaknesses: [],
      studyRecommendations: [], overallComment: '', totalScore: 55, gradedAt: '2026-11-01T00:11:00Z', runner: 'claude',
    },
    ...changes,
  }
  repositories.saveAttempt(attempt)
  return attempt
}

async function finished(context: AppContext, jobId: string): Promise<Job> {
  await vi.waitFor(() => {
    if (context.jobs.list().find((job) => job.id === jobId)?.status === 'running') throw new Error('still running')
  })
  return context.jobs.list().find((job) => job.id === jobId)!
}

function storedAttempt(context: AppContext): Attempt {
  return context.repositories().requireAttempt('a-1')
}

afterEach(removeTestDataDirectories)

describe('requestFollowUps', () => {
  it('saves one round of at most two questions', async () => {
    graderReturning()
    const context = createTestAppContext()
    seedGradedAttempt(context)

    await finished(context, requestFollowUps(context, 'a-1'))

    expect(storedAttempt(context).followUps?.map((followUp) => followUp.question)).toEqual(['꼬리 질문 1', '꼬리 질문 2'])
  })

  it('waits until every earlier follow-up is evaluated before the next round', async () => {
    graderReturning()
    const context = createTestAppContext()
    seedGradedAttempt(context)
    await finished(context, requestFollowUps(context, 'a-1'))

    expect(() => requestFollowUps(context, 'a-1')).toThrow('모두 답하고')
  })

  it('stops at the follow-up limit', () => {
    graderReturning()
    const context = createTestAppContext()
    const evaluated = { id: 'f', question: 'q', focus: '', createdAt: '', answer: 'a', answeredAt: '', evaluation: EVALUATION as never }
    seedGradedAttempt(context, { followUps: Array.from({ length: MAX_FOLLOW_UPS }, (_, index) => ({ ...evaluated, id: `f-${index}` })) })

    expect(() => requestFollowUps(context, 'a-1')).toThrow(`${MAX_FOLLOW_UPS}개까지`)
  })

  it('refuses attempts that are not graded', () => {
    graderReturning()
    const context = createTestAppContext()
    seedGradedAttempt(context, { status: 'draft', grading: null })

    expect(() => requestFollowUps(context, 'a-1')).toThrow('채점이 끝난')
  })
})

describe('answerFollowUp', () => {
  it('keeps the answer and stores the evaluation', async () => {
    graderReturning()
    const context = createTestAppContext()
    seedGradedAttempt(context)
    await finished(context, requestFollowUps(context, 'a-1'))
    const followUpId = storedAttempt(context).followUps![0].id

    await finished(context, answerFollowUp(context, 'a-1', followUpId, '  컨슈머가 멱등해야 합니다.  '))

    expect(storedAttempt(context).followUps![0]).toMatchObject({ answer: '컨슈머가 멱등해야 합니다.', evaluation: EVALUATION, evaluationError: null })
  })

  it('records a failed evaluation and evaluates again on retry', async () => {
    graderReturning({ 'follow-up-evaluation': () => { throw new Error('모델 응답이 형식에 맞지 않습니다.') } })
    const context = createTestAppContext()
    seedGradedAttempt(context)
    await finished(context, requestFollowUps(context, 'a-1'))
    const followUpId = storedAttempt(context).followUps![0].id

    await finished(context, answerFollowUp(context, 'a-1', followUpId, '답'))
    expect(storedAttempt(context).followUps![0]).toMatchObject({ answer: '답', evaluation: null, evaluationError: '모델 응답이 형식에 맞지 않습니다.' })

    graderReturning()
    await finished(context, retryFollowUpEvaluation(context, 'a-1', followUpId))
    expect(storedAttempt(context).followUps![0]).toMatchObject({ evaluation: EVALUATION, evaluationError: null })
  })

  it('refuses an empty answer and a second answer', async () => {
    graderReturning()
    const context = createTestAppContext()
    seedGradedAttempt(context)
    await finished(context, requestFollowUps(context, 'a-1'))
    const followUpId = storedAttempt(context).followUps![0].id

    expect(() => answerFollowUp(context, 'a-1', followUpId, '   ')).toThrow('답을 입력')
    await finished(context, answerFollowUp(context, 'a-1', followUpId, '답'))
    expect(() => answerFollowUp(context, 'a-1', followUpId, '다른 답')).toThrow('이미 답한')
  })
})

describe('askInquiry', () => {
  it('stores the answer and passes earlier answered questions along', async () => {
    graderReturning()
    const context = createTestAppContext()
    seedGradedAttempt(context)

    await finished(context, askInquiry(context, 'a-1', '왜 부분 충족인가요?'))
    await finished(context, askInquiry(context, 'a-1', '모범 답안의 outbox는 왜 필요한가요?'))

    expect(storedAttempt(context).inquiries?.map((inquiry) => inquiry.answer)).toEqual(['답: 왜 부분 충족인가요?', '답: 모범 답안의 outbox는 왜 필요한가요?'])
    expect(runSkill.mock.lastCall![0].payload.previousInquiries).toEqual([{ question: '왜 부분 충족인가요?', answer: '답: 왜 부분 충족인가요?' }])
  })

  it('refuses a new question while the previous one is still waiting for an answer', () => {
    runSkill.mockReset().mockImplementation(() => new Promise(() => {}))
    const context = createTestAppContext()
    seedGradedAttempt(context)

    askInquiry(context, 'a-1', '첫 질문')

    expect(() => askInquiry(context, 'a-1', '두 번째 질문')).toThrow('기다리는 중')
  })

  it('keeps a failed question and answers it on retry', async () => {
    graderReturning({ 'inquiry-answer': () => { throw new Error('시간 초과') } })
    const context = createTestAppContext()
    seedGradedAttempt(context)
    await finished(context, askInquiry(context, 'a-1', '질문'))
    const inquiryId = storedAttempt(context).inquiries![0].id
    expect(storedAttempt(context).inquiries![0]).toMatchObject({ answer: null, error: '시간 초과' })

    graderReturning()
    await finished(context, retryInquiry(context, 'a-1', inquiryId))
    expect(storedAttempt(context).inquiries![0]).toMatchObject({ answer: '답: 질문', error: null })
  })
})

describe('recoverInterruptedDiscussions', () => {
  it('marks evaluations and answers left waiting by a previous run as failed so they can be retried', () => {
    const context = createTestAppContext()
    const base = { question: 'q', focus: '', createdAt: '', answeredAt: '' }
    seedGradedAttempt(context, {
      followUps: [
        { ...base, id: 'waiting', answer: '답', evaluation: null },
        { ...base, id: 'unanswered', answer: null, evaluation: null },
        { ...base, id: 'evaluated', answer: '답', evaluation: EVALUATION as never },
      ],
      inquiries: [{ id: 'iq', question: '질문', askedAt: '', answer: null, answeredAt: null }],
    })

    recoverInterruptedDiscussions(context.repositories())

    const attempt = storedAttempt(context)
    expect(attempt.followUps!.map((followUp) => Boolean(followUp.evaluationError))).toEqual([true, false, false])
    expect(attempt.inquiries![0].error).toContain('중단')
  })
})
