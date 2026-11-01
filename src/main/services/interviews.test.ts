import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConversationInterview, Question, QuestionCategory, QuestionFormat, QuestionSpec, TimedInterview } from '@shared/types'
import { CLOSING_MESSAGE } from '../domain/interviews'
import type { AppContext } from './appContext'
import {
  abandonInterview, answerConversation, beginTimedItem, finishConversation, startConversationInterview, startTimedInterview, submitTimedItem,
} from './interviews'
import { createTestAppContext, questionContentFor, removeTestDataDirectories } from './testAppContext'

const { runSkill } = vi.hoisted(() => ({ runSkill: vi.fn() }))
vi.mock('../llm/skillRunner', async () => {
  const { CancelledError } = await import('../llm/processRunner')
  return { CancelledError, RunnerError: class extends Error {}, runSkill }
})

const GRADING = {
  requiredCoverage: [], bonusMatched: [], deductionsApplied: [], perspectiveScores: [],
  strengths: [], weaknesses: [], studyRecommendations: [], overallComment: '',
}
const REPORT = {
  overallScore: 120, summary: '요약', questions: [{ question: '질문', assessment: '평가', score: -5 }],
  strengths: [], weaknesses: [], studyRecommendations: [],
}

/** Fake skills: question author and grader always succeed, interview turns are handed out in order. */
function fakeSkills(turns: { action: string; message: string; assessment?: string }[] = []) {
  let generated = 0
  runSkill.mockReset().mockImplementation(async ({ schema, payload }: { schema: string; payload: QuestionSpec }) => {
    if (schema === 'duplicate-check') return { isDuplicate: false, duplicateOfId: '', reason: '' }
    if (schema === 'question-content') return questionContentFor(payload, `Generated question ${++generated} ${'x'.repeat(generated * 9)}`)
    if (schema === 'grading-result') return GRADING
    if (schema === 'interview-report') return REPORT
    const turn = turns.shift()
    if (!turn) throw new Error('no more turns')
    return { assessment: '', ...turn }
  })
}

function bankQuestion(id: string, format: QuestionFormat, category: QuestionCategory, topic: string): Question {
  const content = questionContentFor({ format, category, topic, difficulty: 'middle' }, `Bank question ${id}`)
  return { ...content, id, source: 'seed', reviewStatus: 'reviewed', createdAt: '2026-10-01T00:00:00.000Z', variantOf: null }
}

async function waitForJobs(context: AppContext): Promise<void> {
  await vi.waitFor(() => {
    if (context.jobs.hasRunningJobs()) throw new Error('jobs still running')
  })
}

function timed(context: AppContext, id: string): TimedInterview {
  return context.repositories().requireInterview(id) as TimedInterview
}

function conversation(context: AppContext, id: string): ConversationInterview {
  return context.repositories().requireInterview(id) as ConversationInterview
}

const TIMED_OPTIONS = { difficulty: 'middle', format: 'mixed', questionCount: 2, timeLimitMinutes: 10 } as const

afterEach(removeTestDataDirectories)

describe('timed interview', () => {
  it('starts at once with bank questions, marks them served and grades a blank answer as zero without the model', async () => {
    fakeSkills()
    const context = createTestAppContext()
    context.repositories().saveQuestion(bankQuestion('scenario', 'scenario', 'code-review', 'kafka'))
    context.repositories().saveQuestion(bankQuestion('concept', 'concept', 'why', 'cache'))

    const id = startTimedInterview(context, TIMED_OPTIONS)
    expect(timed(context, id).status).toBe('in-progress')
    expect(context.repositories().questions.readAll().every((question) => question.servedAt)).toBe(true)

    beginTimedItem(context, id)
    const firstAttemptId = timed(context, id).items[0].attemptId!
    expect(context.repositories().requireAttempt(firstAttemptId)).toMatchObject({ origin: 'interview', interviewId: id, status: 'draft' })

    submitTimedItem(context, id, '  ', true)
    expect(context.repositories().requireAttempt(firstAttemptId)).toMatchObject({ status: 'graded', grading: { totalScore: 0 } })
    expect(runSkill).not.toHaveBeenCalled()

    beginTimedItem(context, id)
    submitTimedItem(context, id, '답안', false)
    await waitForJobs(context)

    expect(timed(context, id).status).toBe('submitted')
    expect(timed(context, id).items.map((item) => item.timedOut)).toEqual([true, false])
    expect(context.repositories().requireAttempt(timed(context, id).items[1].attemptId!).status).toBe('graded')
  })

  it('generates the questions the bank does not have before the session starts', async () => {
    fakeSkills()
    const context = createTestAppContext()

    const id = startTimedInterview(context, TIMED_OPTIONS)
    expect(timed(context, id).status).toBe('preparing')
    await waitForJobs(context)

    expect(timed(context, id).status).toBe('in-progress')
    const questionIds = timed(context, id).items.map((item) => item.questionId)
    expect(questionIds.every(Boolean)).toBe(true)
    expect(questionIds.map((questionId) => context.repositories().requireQuestion(questionId!).servedAt)).not.toContain(undefined)
  })

  it('keeps submitted items when abandoned and returns the unanswered questions to the bank', () => {
    fakeSkills()
    const context = createTestAppContext()
    context.repositories().saveQuestion(bankQuestion('scenario', 'scenario', 'code-review', 'kafka'))
    context.repositories().saveQuestion(bankQuestion('concept', 'concept', 'why', 'cache'))
    const id = startTimedInterview(context, TIMED_OPTIONS)
    beginTimedItem(context, id)
    submitTimedItem(context, id, '', false)
    beginTimedItem(context, id)
    const unfinishedAttemptId = timed(context, id).items[1].attemptId!

    abandonInterview(context, id)

    expect(timed(context, id)).toMatchObject({ status: 'abandoned', items: [{ questionId: 'scenario' }] })
    expect(context.repositories().attempts.read(unfinishedAttemptId)).toBeNull()
    expect(context.repositories().requireQuestion('concept').servedAt).toBeUndefined()
    expect(context.repositories().requireQuestion('scenario').servedAt).toBeDefined()
  })
})

describe('conversation interview', () => {
  it('records the assessment on the answer, keeps the counts and ends with a report', async () => {
    fakeSkills([
      { action: 'main-question', message: '첫 질문입니다.' },
      { action: 'follow-up', message: '꼬리 질문입니다.', assessment: '근거가 부족합니다.' },
      // Only finishing is allowed now, so this extra question is replaced by the closing line.
      { action: 'follow-up', message: '또 다른 꼬리 질문입니다.' },
    ])
    const context = createTestAppContext()
    const id = startConversationInterview(context, { difficulty: 'middle', mainQuestionCount: 1, maxFollowUps: 1 })
    await waitForJobs(context)
    expect(conversation(context, id).messages).toMatchObject([{ role: 'interviewer', kind: 'main', text: '첫 질문입니다.' }])

    answerConversation(context, id, '첫 답변')
    await waitForJobs(context)
    expect(conversation(context, id).messages.slice(1)).toMatchObject([
      { role: 'candidate', text: '첫 답변', assessment: '근거가 부족합니다.' },
      { role: 'interviewer', kind: 'follow-up' },
    ])

    answerConversation(context, id, '둘째 답변')
    await waitForJobs(context)

    const finished = conversation(context, id)
    expect(finished.messages.at(-1)).toMatchObject({ kind: 'closing', text: CLOSING_MESSAGE })
    expect(finished.status).toBe('completed')
    expect(finished.report).toMatchObject({ overallScore: 100, questions: [{ score: 0 }] })
    expect(finished.completedAt).not.toBeNull()
  })

  it('refuses an answer while the interviewer has not asked yet', async () => {
    fakeSkills([{ action: 'main-question', message: '첫 질문입니다.' }])
    const context = createTestAppContext()
    const id = startConversationInterview(context, { difficulty: 'middle', mainQuestionCount: 1, maxFollowUps: 0 })
    expect(() => answerConversation(context, id, '답변')).toThrow()
    await waitForJobs(context)
  })

  it('abandons an interview finished before any answer', async () => {
    fakeSkills([{ action: 'main-question', message: '첫 질문입니다.' }])
    const context = createTestAppContext()
    const id = startConversationInterview(context, { difficulty: 'junior', mainQuestionCount: 2, maxFollowUps: 1 })
    await waitForJobs(context)

    finishConversation(context, id)

    expect(conversation(context, id).status).toBe('abandoned')
  })
})
