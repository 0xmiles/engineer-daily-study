import type { GradingResult, QuestionContent } from '@shared/types'
import { HINT_PENALTY } from '@shared/rules'
import { isShortAnswer } from '@shared/taxonomy'

// Weights mirror skills/daily-study-grader/references/grading-guide.md; change both together.
const REQUIRED_WEIGHT = 60
const PERSPECTIVE_WEIGHT = 30
const BONUS_WEIGHT = 10
const DEDUCTION_PER_ITEM = 5
const MAX_DEDUCTION = 20
const MAX_PERSPECTIVE_SCORE = 10

const COVERAGE_CREDIT = { full: 1, partial: 0.5, missing: 0 } as const

function coverageRatio(result: GradingResult): number {
  if (result.requiredCoverage.length === 0) return 0
  const credit = result.requiredCoverage.reduce((sum, item) => sum + COVERAGE_CREDIT[item.status], 0)
  return credit / result.requiredCoverage.length
}

function perspectiveScore(result: GradingResult): number {
  if (result.perspectiveScores.length === 0) return 0
  const clamped = result.perspectiveScores.map((item) => Math.min(MAX_PERSPECTIVE_SCORE, Math.max(0, item.score)))
  const average = clamped.reduce((sum, score) => sum + score, 0) / clamped.length
  return (average / MAX_PERSPECTIVE_SCORE) * PERSPECTIVE_WEIGHT
}

function bonusScore(question: QuestionContent, result: GradingResult): number {
  const bonusCount = question.rubric.bonus.length
  if (bonusCount === 0) return 0
  return (Math.min(result.bonusMatched.length, bonusCount) / bonusCount) * BONUS_WEIGHT
}

function deduction(result: GradingResult): number {
  return Math.min(MAX_DEDUCTION, result.deductionsApplied.length * DEDUCTION_PER_ITEM)
}

export function computeTotalScore(question: QuestionContent, result: GradingResult): number {
  // A short answer has no perspectives or bonus items, so the verdict alone decides the score.
  if (isShortAnswer(question)) return Math.round(coverageRatio(result) * 100)
  const total = coverageRatio(result) * REQUIRED_WEIGHT + perspectiveScore(result) + bonusScore(question, result) - deduction(result)
  return Math.round(Math.min(100, Math.max(0, total)))
}

/** Hints are charged after grading, so the grader judges the answer alone. */
export function hintPenaltyFor(hintCount: number): number {
  return hintCount * HINT_PENALTY
}

export function applyHintPenalty(totalScore: number, hintCount: number): number {
  return Math.max(0, totalScore - hintPenaltyFor(hintCount))
}
