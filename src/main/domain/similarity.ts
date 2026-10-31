import type { QuestionContent } from '@shared/types'

export const SIMILARITY_CANDIDATE_THRESHOLD = 0.3
const MAX_SIMILAR_CANDIDATES = 5

type Comparable = Pick<QuestionContent, 'title' | 'keyIssues'>

function characterBigrams(text: string): Set<string> {
  const normalized = text.replace(/\s+/g, '').toLowerCase()
  const bigrams = new Set<string>()
  for (let index = 0; index < normalized.length - 1; index++) bigrams.add(normalized.slice(index, index + 2))
  return bigrams
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  let intersection = 0
  for (const value of left) if (right.has(value)) intersection++
  const union = left.size + right.size - intersection
  return union === 0 ? 0 : intersection / union
}

function fingerprint(question: Comparable): Set<string> {
  return characterBigrams(`${question.title} ${question.keyIssues.join(' ')}`)
}

export function questionSimilarity(left: Comparable, right: Comparable): number {
  return jaccardSimilarity(fingerprint(left), fingerprint(right))
}

/** Cheap pre-filter: only these candidates are sent to the LLM for a duplicate verdict. */
export function findSimilarQuestions<T extends Comparable>(candidate: Comparable, existing: T[]): T[] {
  const candidateFingerprint = fingerprint(candidate)
  return existing
    .map((question) => ({ question, similarity: jaccardSimilarity(candidateFingerprint, fingerprint(question)) }))
    .filter((entry) => entry.similarity >= SIMILARITY_CANDIDATE_THRESHOLD)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, MAX_SIMILAR_CANDIDATES)
    .map((entry) => entry.question)
}

export function hasSameTitle(candidate: Comparable, existing: Comparable[]): boolean {
  const normalizedTitle = candidate.title.replace(/\s+/g, '')
  return existing.some((question) => question.title.replace(/\s+/g, '') === normalizedTitle)
}
