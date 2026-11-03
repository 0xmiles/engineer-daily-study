import { describe, expect, it } from 'vitest'
import type { Attempt, Question, QuestionCategory, QuestionFormat } from '@shared/types'
import { computeStats } from './stats'

function question(id: string, format: QuestionFormat, category: QuestionCategory): Question {
  return { id, format, category, topic: 'kafka' } as Question
}

function gradedAttempt(questionId: string, totalScore: number): Attempt {
  return { id: `a-${questionId}`, questionId, status: 'graded', grading: { totalScore, perspectiveScores: [] } } as unknown as Attempt
}

describe('computeStats', () => {
  const questions = [question('essay', 'concept', 'why'), question('short', 'short-answer', 'term-definition')]
  const attempts = [gradedAttempt('essay', 55), gradedAttempt('short', 100)]

  it('keeps short answers out of the overall average and the topic buckets', () => {
    const stats = computeStats(attempts, questions)
    expect(stats.averageScore).toBe(55)
    expect(stats.byTopic).toEqual([{ key: 'kafka', count: 1, averageScore: 55 }])
  })

  it('still counts short answers and reports them under their own category', () => {
    const stats = computeStats(attempts, questions)
    expect(stats.gradedCount).toBe(2)
    expect(stats.byCategory.find((bucket) => bucket.key === 'term-definition')).toMatchObject({ count: 1, averageScore: 100 })
  })
})
