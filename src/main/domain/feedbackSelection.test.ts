import { describe, expect, it } from 'vitest'
import type { Feedback, Question } from '@shared/types'
import { poorlyRatedQuestionIds, selectAuthoringGuidelines } from './feedbackSelection'
import { findSimilarQuestions } from './similarity'

function feedback(overrides: Partial<Feedback>): Feedback {
  return { id: 'f', kind: 'authoring', questionId: null, rating: null, reasons: [], comment: '', scope: {}, active: true, createdAt: '2026-10-31T00:00:00Z', ...overrides }
}

const kafkaQuestion = { id: 'q1', title: '컨슈머 지연', topic: 'kafka', category: 'why' } as Question
const spec = { format: 'concept', category: 'comparison', topic: 'kafka', difficulty: 'middle' } as const

describe('selectAuthoringGuidelines', () => {
  it('keeps active feedback whose scope matches the spec', () => {
    const feedbacks = [
      feedback({ id: 'global', comment: '전체 지침' }),
      feedback({ id: 'cache', comment: '캐시 지침', scope: { topic: 'cache' } }),
      feedback({ id: 'inactive', comment: '끈 지침', active: false }),
    ]
    expect(selectAuthoringGuidelines(feedbacks, [], spec).map((guideline) => guideline.guideline)).toEqual(['전체 지침'])
  })

  it('includes question feedback on the same topic', () => {
    const questionFeedback = feedback({ kind: 'question', questionId: 'q1', rating: 'poor', reasons: ['too-easy'], comment: '쉬움' })
    const [guideline] = selectAuthoringGuidelines([questionFeedback], [kafkaQuestion], spec)
    expect(guideline.guideline).toContain('너무 쉬움')
  })
})

describe('poorlyRatedQuestionIds', () => {
  it('collects only active poor ratings', () => {
    const feedbacks = [
      feedback({ kind: 'question', questionId: 'poor', rating: 'poor' }),
      feedback({ kind: 'question', questionId: 'good', rating: 'good' }),
      feedback({ kind: 'question', questionId: 'off', rating: 'poor', active: false }),
    ]
    expect([...poorlyRatedQuestionIds(feedbacks)]).toEqual(['poor'])
  })
})

describe('findSimilarQuestions', () => {
  it('finds questions sharing most key issues and skips unrelated ones', () => {
    const candidate = { title: '주문 저장과 이벤트 발행 불일치', keyIssues: ['DB 커밋과 메시지 발행의 이중 쓰기', '컨슈머 멱등 처리'] }
    const similar = { id: 'similar', title: '주문 저장 후 이벤트 발행 누락', keyIssues: ['DB 커밋과 메시지 발행의 이중 쓰기', '컨슈머 멱등 처리'] }
    const unrelated = { id: 'unrelated', title: '레디스 단일 스레드 지연', keyIssues: ['큰 키', 'fork 지연'] }
    expect(findSimilarQuestions(candidate, [similar, unrelated]).map((question) => question.id)).toEqual(['similar'])
  })
})
