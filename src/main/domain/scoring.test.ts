import { describe, expect, it } from 'vitest'
import type { GradingResult, QuestionContent } from '@shared/types'
import { applyHintPenalty, computeTotalScore } from './scoring'

const rubricItem = (point: string) => ({ point, explanation: '' })
const question = {
  rubric: { required: [rubricItem('a'), rubricItem('b')], bonus: [rubricItem('x'), rubricItem('y')], deductions: [rubricItem('d')], commonMistakes: [] },
} as unknown as QuestionContent

function grading(overrides: Partial<GradingResult>): GradingResult {
  return {
    requiredCoverage: [{ point: 'a', status: 'full', comment: '' }, { point: 'b', status: 'full', comment: '' }],
    bonusMatched: ['x', 'y'],
    deductionsApplied: [],
    perspectiveScores: [{ perspective: 'p', score: 10, comment: '' }],
    strengths: [], weaknesses: [], studyRecommendations: [], overallComment: '',
    ...overrides,
  }
}

describe('computeTotalScore for a short answer', () => {
  const shortAnswer = { ...question, format: 'short-answer' } as QuestionContent
  const verdict = (status: 'full' | 'partial' | 'missing') => grading({ requiredCoverage: [{ point: 'a', status, comment: '' }], bonusMatched: [], perspectiveScores: [] })

  it('scores 100, 50 and 0 by verdict', () => {
    expect(computeTotalScore(shortAnswer, verdict('full'))).toBe(100)
    expect(computeTotalScore(shortAnswer, verdict('partial'))).toBe(50)
    expect(computeTotalScore(shortAnswer, verdict('missing'))).toBe(0)
  })

  it('uses the first verdict when the grader split the answer into several items', () => {
    const coverage = [{ point: 'a', status: 'full', comment: '' }, { point: 'b', status: 'missing', comment: '' }] as const
    expect(computeTotalScore(shortAnswer, grading({ requiredCoverage: [...coverage] }))).toBe(100)
  })

  it('fails instead of scoring 0 when the grader returned no verdict', () => {
    expect(() => computeTotalScore(shortAnswer, grading({ requiredCoverage: [] }))).toThrow()
  })

  it('ignores deductions the grader reported', () => {
    expect(computeTotalScore(shortAnswer, { ...verdict('full'), deductionsApplied: ['d'] })).toBe(100)
  })
})

describe('computeTotalScore', () => {
  it('gives 100 for a perfect answer', () => {
    expect(computeTotalScore(question, grading({}))).toBe(100)
  })

  it('counts partial coverage as half', () => {
    const result = grading({ requiredCoverage: [{ point: 'a', status: 'full', comment: '' }, { point: 'b', status: 'partial', comment: '' }] })
    expect(computeTotalScore(question, result)).toBe(85)
  })

  it('caps deductions at 20 and never goes below 0', () => {
    const result = grading({
      requiredCoverage: [{ point: 'a', status: 'missing', comment: '' }],
      bonusMatched: [],
      perspectiveScores: [{ perspective: 'p', score: 0, comment: '' }],
      deductionsApplied: ['d', 'd', 'd', 'd', 'd'],
    })
    expect(computeTotalScore(question, result)).toBe(0)
  })

  it('clamps perspective scores outside 0~10', () => {
    const result = grading({ perspectiveScores: [{ perspective: 'p', score: 15, comment: '' }] })
    expect(computeTotalScore(question, result)).toBe(100)
  })
})

describe('applyHintPenalty', () => {
  it('takes 5 points per hint and never goes below zero', () => {
    expect(applyHintPenalty(80, 0)).toBe(80)
    expect(applyHintPenalty(80, 3)).toBe(65)
    expect(applyHintPenalty(10, 3)).toBe(0)
  })
})
