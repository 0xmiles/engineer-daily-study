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

/** A bank question that names the keyword among the topics to study for it. */
interface QuestionNeed {
  keyword: string
  question: Question
}

function questionNeeds(questions: Question[]): QuestionNeed[] {
  return questions.flatMap((question) => question.relatedStudyTopics.map((keyword) => ({ keyword, question })))
}

// A question that lists the keyword twice in two spellings still needs it once.
function uniqueByQuestion(needs: QuestionNeed[]): QuestionNeed[] {
  const seen = new Set<string>()
  return needs.filter(({ question }) => {
    if (seen.has(question.id)) return false
    seen.add(question.id)
    return true
  })
}

function toNote(key: string, recommendations: Recommendation[], needs: QuestionNeed[], state: StudyNoteState | undefined): StudyNote {
  const newestFirst = uniqueBySource([...recommendations].sort((left, right) => right.source.recommendedAt.localeCompare(left.source.recommendedAt)))
  const neededBy = uniqueByQuestion([...needs].sort((left, right) => right.question.createdAt.localeCompare(left.question.createdAt)))
  // Only a recommendation reopens a done note; a new question needing a keyword already studied does not.
  const lastRecommendedAt = newestFirst[0]?.source.recommendedAt ?? null
  const manual = state?.manual ?? null
  const topics = [
    ...newestFirst.map((recommendation) => recommendation.topic),
    ...neededBy.map((need) => need.question.topic),
    ...(manual?.topics ?? []),
  ]
  const doneAt = state?.doneAt ?? null
  return {
    key,
    // Every note has a recommendation, a question need or the user's own entry, so one of them spells the keyword.
    keyword: (newestFirst[0]?.keyword ?? neededBy[0]?.keyword ?? manual?.keyword ?? '').trim(),
    sources: newestFirst.map((recommendation) => recommendation.source),
    questions: neededBy.map(({ question }) => ({ id: question.id, title: question.title })),
    topics: [...new Set(topics.filter((topic): topic is Topic => topic !== null))],
    memo: state?.memo ?? '',
    isDone: doneAt !== null && (lastRecommendedAt === null || doneAt >= lastRecommendedAt),
    isReopened: doneAt !== null && lastRecommendedAt !== null && doneAt < lastRecommendedAt,
    lastRecommendedAt,
    hasGuide: Boolean(state?.guide),
    addedAt: manual?.addedAt ?? null,
  }
}

/**
 * Open notes first, notes recommended again after being done ahead of those, then the keywords the user added, newest first,
 * then the most recommended. A gap a grading found comes before a keyword only bank questions name; among those,
 * the one more questions need comes first.
 */
function compareNotes(left: StudyNote, right: StudyNote): number {
  if (left.isDone !== right.isDone) return left.isDone ? 1 : -1
  if (left.isReopened !== right.isReopened) return left.isReopened ? -1 : 1
  // An empty string sorts last, so a note the user added comes before one they did not.
  const addedOrder = (right.addedAt ?? '').localeCompare(left.addedAt ?? '')
  if (addedOrder !== 0) return addedOrder
  if (left.sources.length !== right.sources.length) return right.sources.length - left.sources.length
  if (left.questions.length !== right.questions.length) return right.questions.length - left.questions.length
  return (right.lastRecommendedAt ?? '').localeCompare(left.lastRecommendedAt ?? '')
}

function groupByKey<T extends { keyword: string }>(entries: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const entry of entries) {
    if (!entry.keyword.trim()) continue
    const key = studyNoteKey(entry.keyword)
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  return groups
}

/**
 * Notes are rebuilt from gradings, interview reports, the bank questions' study topics and the keywords the user added
 * on every read; only the user's memo, done mark, own keywords and the written guide are stored.
 */
export function buildStudyNotes({ attempts, questions, interviews, states }: StudyNoteInputs): StudyNote[] {
  const recommendationsByKey = groupByKey([...attemptRecommendations(attempts, questions), ...interviewRecommendations(interviews)])
  const needsByKey = groupByKey(questionNeeds(questions))
  const statesByKey = new Map(states.map((state) => [state.key, state]))
  const addedKeys = states.filter((state) => state.manual).map((state) => state.key)
  const keys = new Set([...recommendationsByKey.keys(), ...needsByKey.keys(), ...addedKeys])
  return [...keys].map((key) => toNote(key, recommendationsByKey.get(key) ?? [], needsByKey.get(key) ?? [], statesByKey.get(key))).sort(compareNotes)
}
