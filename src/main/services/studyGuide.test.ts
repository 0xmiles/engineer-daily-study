import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attempt, Question } from '@shared/types'
import type { AppContext } from './appContext'
import { generateStudyGuide } from './studyGuide'
import { getStudyNote, listStudyNotes, updateStudyNote } from './studyNotes'
import { createTestAppContext, questionContentFor, removeTestDataDirectories } from './testAppContext'

const { runSkill } = vi.hoisted(() => ({ runSkill: vi.fn() }))
vi.mock('../llm/skillRunner', async () => {
  const { CancelledError } = await import('../llm/processRunner')
  return { CancelledError, RunnerError: class extends Error {}, runSkill }
})

const GUIDE = {
  summary: '리밸런싱은 컨슈머 그룹의 파티션을 다시 나누는 과정입니다.',
  sections: [{ heading: '동작 원리', body: '그룹 코디네이터가 조율합니다.' }],
  pitfalls: [],
  selfCheck: [{ question: '컨슈머가 죽으면 어떻게 될까요?', answer: '세션 타임아웃 뒤 리밸런싱이 일어납니다.' }],
  relatedKeywords: ['Static Membership'],
}

/** A graded senior Kafka attempt that recommended "Kafka 리밸런싱". */
function saveRecommendingAttempt(context: AppContext): void {
  const content = questionContentFor({ format: 'scenario', category: 'design-review', topic: 'kafka', difficulty: 'senior' }, 'Kafka 컨슈머 지연')
  const question = { ...content, id: 'q-1', source: 'seed', reviewStatus: 'reviewed', createdAt: '2026-10-01T00:00:00Z', variantOf: null } as Question
  const attempt = {
    id: 'a-1', questionId: 'q-1', origin: 'daily', date: '2026-10-01', answer: '답안', status: 'graded', createdAt: '2026-10-01T00:00:00Z',
    draftSavedAt: null, submittedAt: '2026-10-01T00:10:00Z', gradingError: null, weaknessFollowUps: 0,
    grading: {
      requiredCoverage: [], bonusMatched: [], deductionsApplied: [], perspectiveScores: [], strengths: [], weaknesses: [], overallComment: '',
      studyRecommendations: [{ keyword: 'Kafka 리밸런싱', reason: '리밸런싱 중 중복 처리를 설명하지 못했습니다.', searchQuery: 'kafka rebalance protocol' }],
      totalScore: 50, gradedAt: '2026-10-01T00:11:00Z', runner: 'claude',
    },
  } as Attempt
  context.repositories().saveQuestion(question)
  context.repositories().saveAttempt(attempt)
}

async function waitForJobs(context: AppContext): Promise<void> {
  await vi.waitFor(() => {
    if (context.jobs.hasRunningJobs()) throw new Error('still running')
  })
}

afterEach(removeTestDataDirectories)

describe('generateStudyGuide', () => {
  it('writes the guide from why the keyword was recommended and keeps the memo saved meanwhile', async () => {
    runSkill.mockReset().mockResolvedValue(GUIDE)
    const context = createTestAppContext()
    saveRecommendingAttempt(context)
    const note = getStudyNote(context.repositories(), 'kafka-리밸런싱')!

    generateStudyGuide(context, note.key)
    updateStudyNote(context, note.key, { memo: '코디네이터 역할 다시 보기' })
    await waitForJobs(context)

    expect(runSkill.mock.calls[0][0]).toMatchObject({
      skill: 'daily-study-tutor',
      schema: 'study-guide',
      payload: {
        keyword: 'Kafka 리밸런싱',
        topics: [{ value: 'kafka' }],
        recommendations: [{ from: 'Kafka 컨슈머 지연', difficulty: 'senior', reason: '리밸런싱 중 중복 처리를 설명하지 못했습니다.' }],
      },
    })
    const detail = getStudyNote(context.repositories(), 'Kafka 리밸런싱')!
    expect(detail).toMatchObject({ memo: '코디네이터 역할 다시 보기', hasGuide: true, guide: { ...GUIDE, runner: 'claude' } })
    expect(context.jobs.list()[0]).toMatchObject({ kind: 'study-guide', status: 'succeeded', targetId: 'Kafka 리밸런싱' })
  })

  it('keeps the guide when the memo or done mark changes, and runs once per note at a time', async () => {
    runSkill.mockReset().mockResolvedValue(GUIDE)
    const context = createTestAppContext()
    saveRecommendingAttempt(context)
    const [note] = listStudyNotes(context.repositories())

    generateStudyGuide(context, note.key)
    expect(() => generateStudyGuide(context, note.key)).toThrow('이미 만들고 있습니다')
    await waitForJobs(context)
    updateStudyNote(context, note.key, { done: true })

    expect(getStudyNote(context.repositories(), note.keyword)).toMatchObject({ isDone: true, guide: { summary: GUIDE.summary } })
  })

  it('writes the guide for a keyword bank questions need from how those questions use it', async () => {
    runSkill.mockReset().mockResolvedValue(GUIDE)
    const context = createTestAppContext()
    const content = questionContentFor({ format: 'concept', category: 'principle', topic: 'kafka', difficulty: 'junior' }, 'ISR이 줄어들 때 일어나는 일')
    const rubric = { ...content.rubric, required: [{ point: 'min.insync.replicas 와 acks=all 의 관계', explanation: '' }] }
    context.repositories().saveQuestion({
      ...content, rubric, keyIssues: ['쓰기 거부 조건'], modelAnswer: '모범 답안', relatedStudyTopics: ['Kafka ISR'],
      id: 'q-2', source: 'seed', reviewStatus: 'reviewed', createdAt: '2026-10-01T00:00:00Z', variantOf: null,
    } as Question)
    const note = getStudyNote(context.repositories(), 'kafka isr')!
    expect(note).toMatchObject({ keyword: 'Kafka ISR', sources: [], questions: [{ id: 'q-2', title: 'ISR이 줄어들 때 일어나는 일' }], hasGuide: false })

    generateStudyGuide(context, note.key)
    await waitForJobs(context)

    const payload = runSkill.mock.calls[0][0].payload
    expect(payload).toEqual({
      keyword: 'Kafka ISR',
      topics: [expect.objectContaining({ value: 'kafka' })],
      recommendations: [],
      questions: [{ title: 'ISR이 줄어들 때 일어나는 일', format: 'concept', difficulty: 'junior', keyIssues: ['쓰기 거부 조건'], requiredPoints: ['min.insync.replicas 와 acks=all 의 관계'] }],
    })
    expect(getStudyNote(context.repositories(), note.keyword)).toMatchObject({ hasGuide: true })
  })

  it('finds nothing for a keyword no grading recommended', () => {
    const context = createTestAppContext()
    expect(getStudyNote(context.repositories(), 'Redis')).toBeNull()
    expect(() => generateStudyGuide(context, 'missing')).toThrow('찾을 수 없습니다')
  })
})
