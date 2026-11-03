import type { Attempt, Question } from '@shared/types'
import type { ScoreBucket, StudyStats } from '@shared/api'
import { isShortAnswer } from '@shared/taxonomy'

function averageBuckets(entries: { key: string; score: number }[]): ScoreBucket[] {
  const sums = new Map<string, { total: number; count: number }>()
  for (const entry of entries) {
    const bucket = sums.get(entry.key) ?? { total: 0, count: 0 }
    bucket.total += entry.score
    bucket.count += 1
    sums.set(entry.key, bucket)
  }
  return [...sums.entries()]
    .map(([key, bucket]) => ({ key, count: bucket.count, averageScore: Math.round((bucket.total / bucket.count) * 10) / 10 }))
    .sort((left, right) => left.averageScore - right.averageScore)
}

/**
 * Short answers keep their own category buckets but stay out of the overall average and the topic buckets:
 * all-or-nothing scores from three questions a day would hide the essay results those numbers exist to show.
 */
export function computeStats(attempts: Attempt[], questions: Question[]): StudyStats {
  const questionsById = new Map(questions.map((question) => [question.id, question]))
  const graded = attempts.filter((attempt) => attempt.status === 'graded' && attempt.grading)
  const withQuestion = graded
    .map((attempt) => ({ attempt, question: questionsById.get(attempt.questionId) }))
    .filter((entry): entry is { attempt: Attempt; question: Question } => entry.question !== undefined)
  const essays = graded.filter((attempt) => {
    const question = questionsById.get(attempt.questionId)
    return !question || !isShortAnswer(question)
  })
  const essaysWithQuestion = withQuestion.filter(({ question }) => !isShortAnswer(question))

  return {
    gradedCount: graded.length,
    averageScore: essays.length === 0 ? null : Math.round(essays.reduce((sum, attempt) => sum + attempt.grading!.totalScore, 0) / essays.length),
    byTopic: averageBuckets(essaysWithQuestion.map(({ attempt, question }) => ({ key: question.topic, score: attempt.grading!.totalScore }))),
    byCategory: averageBuckets(withQuestion.map(({ attempt, question }) => ({ key: question.category, score: attempt.grading!.totalScore }))),
    byPerspective: averageBuckets(
      graded.flatMap((attempt) => attempt.grading!.perspectiveScores.map((item) => ({ key: item.perspective, score: item.score * 10 }))),
    ),
  }
}
