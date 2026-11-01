import { createHash } from 'node:crypto'
import type { Attempt, Interview, Question, StudyNoteState, Topic } from '@shared/types'
import type { StudyNote, StudyNoteSource } from '@shared/api'
import { localDateKey } from './dates'

interface Recommendation {
  keyword: string
  topic: Topic | null
  source: StudyNoteSource
}

export interface StudyNoteInputs {
  attempts: Attempt[]
  questions: Question[]
  interviews: Interview[]
  states: StudyNoteState[]
}

/** "Kafka 리밸런싱", "kafka-리밸런싱" and "Kafka 리밸런싱." are the same thing to study. */
export function normalizeKeyword(keyword: string): string {
  const folded = keyword.normalize('NFKC').toLowerCase()
  return folded.replace(/[\s\p{P}]/gu, '') || folded.trim()
}

// Keywords are mostly Korean, which storage keys cannot hold, so the key is a hash of the normalized keyword.
export function studyNoteKey(keyword: string): string {
  return createHash('sha1').update(normalizeKeyword(keyword)).digest('hex').slice(0, 16)
}

function attemptRecommendations(attempts: Attempt[], questions: Question[]): Recommendation[] {
  const questionsById = new Map(questions.map((question) => [question.id, question]))
  return attempts
    .filter((attempt) => attempt.status === 'graded' && attempt.grading)
    .flatMap((attempt) => {
      const question = questionsById.get(attempt.questionId)
      return attempt.grading!.studyRecommendations.map((item) => ({
        keyword: item.keyword,
        topic: question?.topic ?? null,
        source: {
          kind: 'attempt' as const,
          id: attempt.id,
          title: question?.title ?? '삭제된 문제',
          reason: item.reason,
          searchQuery: item.searchQuery,
          recommendedAt: attempt.grading!.gradedAt,
        },
      }))
    })
}

function interviewRecommendations(interviews: Interview[]): Recommendation[] {
  return interviews.flatMap((interview) => {
    if (interview.mode !== 'conversation' || interview.status !== 'completed' || !interview.report || !interview.completedAt) return []
    const completedAt = interview.completedAt
    return interview.report.studyRecommendations.map((item) => ({
      keyword: item.keyword,
      topic: interview.topic,
      source: {
        kind: 'interview' as const,
        id: interview.id,
        title: `대화형 모의 면접 · ${localDateKey(new Date(completedAt))}`,
        reason: item.reason,
        searchQuery: item.searchQuery,
        recommendedAt: completedAt,
      },
    }))
  })
}

// One grading that lists a keyword twice still counts as one recommendation.
function uniqueBySource(recommendations: Recommendation[]): Recommendation[] {
  const seen = new Set<string>()
  return recommendations.filter(({ source }) => {
    const sourceKey = `${source.kind}:${source.id}`
    if (seen.has(sourceKey)) return false
    seen.add(sourceKey)
    return true
  })
}

function toNote(key: string, recommendations: Recommendation[], state: StudyNoteState | undefined): StudyNote {
  const newestFirst = uniqueBySource([...recommendations].sort((left, right) => right.source.recommendedAt.localeCompare(left.source.recommendedAt)))
  const lastRecommendedAt = newestFirst[0].source.recommendedAt
  const doneAt = state?.doneAt ?? null
  return {
    key,
    keyword: newestFirst[0].keyword.trim(),
    sources: newestFirst.map((recommendation) => recommendation.source),
    topics: [...new Set(newestFirst.map((recommendation) => recommendation.topic).filter((topic): topic is Topic => topic !== null))],
    memo: state?.memo ?? '',
    isDone: doneAt !== null && doneAt >= lastRecommendedAt,
    isReopened: doneAt !== null && doneAt < lastRecommendedAt,
    lastRecommendedAt,
  }
}

/** Open notes first, notes recommended again after being done ahead of those, then the most recommended. */
function compareNotes(left: StudyNote, right: StudyNote): number {
  if (left.isDone !== right.isDone) return left.isDone ? 1 : -1
  if (left.isReopened !== right.isReopened) return left.isReopened ? -1 : 1
  if (left.sources.length !== right.sources.length) return right.sources.length - left.sources.length
  return right.lastRecommendedAt.localeCompare(left.lastRecommendedAt)
}

/** Notes are rebuilt from gradings and interview reports on every read; only the user's memo and done mark are stored. */
export function buildStudyNotes({ attempts, questions, interviews, states }: StudyNoteInputs): StudyNote[] {
  const groups = new Map<string, Recommendation[]>()
  for (const recommendation of [...attemptRecommendations(attempts, questions), ...interviewRecommendations(interviews)]) {
    if (!recommendation.keyword.trim()) continue
    const key = studyNoteKey(recommendation.keyword)
    groups.set(key, [...(groups.get(key) ?? []), recommendation])
  }
  const statesByKey = new Map(states.map((state) => [state.key, state]))
  return [...groups.entries()].map(([key, recommendations]) => toNote(key, recommendations, statesByKey.get(key))).sort(compareNotes)
}
