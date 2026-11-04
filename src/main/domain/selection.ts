import type { Attempt, DailyItem, DailySet, Difficulty, Question, QuestionFormat, QuestionSpec, Topic } from '@shared/types'
import { DAILY_SHORT_ANSWER_COUNT } from '@shared/rules'
import { activeCategoryOf, categoriesOf, isShortAnswer, scenarioCategoryForWeekday } from '@shared/taxonomy'
import { daysBetween, parseDateKey } from './dates'

const WEAKNESS_SCORE_THRESHOLD = 60
const WEAKNESS_FOLLOW_UP_DAYS = [3, 7]

export interface SelectionContext {
  questions: Question[]
  attempts: Attempt[]
  poorlyRatedQuestionIds: Set<string>
  /** Topics automatic selection may pick, in display order; never empty. */
  topics: Topic[]
}

export interface DailyPlanOptions {
  date: string
  difficulty: Difficulty
  dailyCount: 2 | 3
}

/**
 * Topics ordered from least recently practiced, so every topic gets regular turns.
 * Short answers and essays rotate separately: three short answers a day would otherwise push essay topics back.
 */
export function topicsByLeastRecent(context: SelectionContext, format: QuestionFormat): Topic[] {
  return topicsByOldestActivity(context, format, (question) => question.servedAt)
}

/** Like topicsByLeastRecent, but adding a question to the bank also counts as activity on its topic. */
function topicsByLeastRecentlyServedOrAdded(context: SelectionContext, format: QuestionFormat): Topic[] {
  return topicsByOldestActivity(context, format, (question) => question.servedAt ?? question.createdAt)
}

function topicsByOldestActivity(context: SelectionContext, format: QuestionFormat, activityTime: (question: Question) => string | undefined): Topic[] {
  const lastSeen = new Map<Topic, string>()
  const seeksShortAnswer = isShortAnswer({ format })
  for (const question of context.questions) {
    if (isShortAnswer(question) !== seeksShortAnswer) continue
    const time = activityTime(question)
    if (!time) continue
    const previous = lastSeen.get(question.topic)
    if (!previous || previous < time) lastSeen.set(question.topic, time)
  }
  return [...context.topics].sort((left, right) => (lastSeen.get(left) ?? '').localeCompare(lastSeen.get(right) ?? ''))
}

/** With fewer enabled topics than items, a topic has to repeat rather than leave nothing to pick from. */
function usableExclusions(context: SelectionContext, excludedTopics: Topic[]): Topic[] {
  return context.topics.every((topic) => excludedTopics.includes(topic)) ? [] : excludedTopics
}

function matchesSpec(question: Question, spec: QuestionSpec): boolean {
  return (
    question.format === spec.format &&
    question.difficulty === spec.difficulty &&
    (!spec.category || question.category === spec.category) &&
    (!spec.topic || question.topic === spec.topic)
  )
}

/**
 * Unserved question that fits the spec; reviewed and well-rated questions first, then least recent topic.
 * Without a topic in the spec only enabled topics qualify; a topic the user named explicitly always does.
 */
export function pickUnservedQuestion(
  context: SelectionContext,
  spec: QuestionSpec,
  excludedTopics: Topic[] = [],
): Question | null {
  const topicOrder = topicsByLeastRecent(context, spec.format)
  const rank = (question: Question): number[] => [
    context.poorlyRatedQuestionIds.has(question.id) ? 1 : 0,
    question.reviewStatus === 'reviewed' ? 0 : 1,
    topicOrder.indexOf(question.topic),
  ]
  const isAllowedTopic = (topic: Topic): boolean => (spec.topic ? true : context.topics.includes(topic)) && !excludedTopics.includes(topic)
  const candidates = context.questions
    .filter((question) => !question.servedAt && matchesSpec(question, spec) && isAllowedTopic(question.topic))
    .sort((left, right) => compareRanks(rank(left), rank(right)))
  return candidates[0] ?? null
}

function compareRanks(left: number[], right: number[]): number {
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return left[index] - right[index]
  return 0
}

/** Fills a missing category or topic so the spec is concrete enough to generate a question. */
export function completeSpec(context: SelectionContext, spec: QuestionSpec, excludedTopics: Topic[] = []): QuestionSpec {
  const exclusions = usableExclusions(context, excludedTopics)
  return fillSpec(spec, topicsByLeastRecent(context, spec.format).filter((candidate) => !exclusions.includes(candidate)))
}

/**
 * Fills a spec right before generating. Unserved questions just added to the bank count as recent,
 * so back-to-back generations spread over topics instead of all taking the least practiced one.
 */
export function completeGenerationSpec(context: SelectionContext, spec: QuestionSpec): QuestionSpec {
  return fillSpec(spec, topicsByLeastRecentlyServedOrAdded(context, spec.format))
}

function fillSpec(spec: QuestionSpec, topicOrder: Topic[]): QuestionSpec {
  const topic = spec.topic ?? topicOrder[0]
  const categories = categoriesOf(spec.format)
  const category = spec.category ?? categories[Math.floor(Math.random() * categories.length)].value
  return { ...spec, topic, category }
}

/** Postponed attempts come back on their retry day, oldest first, until one is solved again. */
export function findDueRetryAttempt(attempts: Attempt[], today: string): Attempt | null {
  return attempts
    .filter((attempt) => attempt.status === 'postponed' && !attempt.retryAttemptId && attempt.retryOn && attempt.retryOn <= today)
    .sort((left, right) => left.retryOn!.localeCompare(right.retryOn!))[0] ?? null
}

export function findDueWeaknessAttempt(attempts: Attempt[], today: string): Attempt | null {
  const isDue = (attempt: Attempt): boolean => {
    if (attempt.status !== 'graded' || !attempt.grading) return false
    if (attempt.grading.totalScore >= WEAKNESS_SCORE_THRESHOLD) return false
    const nextFollowUpDay = WEAKNESS_FOLLOW_UP_DAYS[attempt.weaknessFollowUps]
    return nextFollowUpDay !== undefined && daysBetween(attempt.date, today) >= nextFollowUpDay
  }
  return attempts.filter(isDue).sort((left, right) => left.date.localeCompare(right.date))[0] ?? null
}

function plannedItem(context: SelectionContext, kind: DailyItem['kind'], spec: QuestionSpec, excludedTopics: Topic[]): DailyItem {
  const exclusions = usableExclusions(context, excludedTopics)
  const question = pickUnservedQuestion(context, spec, exclusions)
  const concreteSpec = question
    ? { ...spec, category: question.category, topic: question.topic }
    : completeSpec(context, spec, exclusions)
  return { kind, questionId: question?.id ?? null, spec: concreteSpec, variantOfAttemptId: null, attemptId: null, generationError: null }
}

function specOf(question: Question): QuestionSpec {
  return { format: question.format, category: question.category, topic: question.topic, difficulty: question.difficulty }
}

/** The variant is a new question, so a retired category is replaced by the one that took its place. */
function weaknessItem(context: SelectionContext, attempt: Attempt): DailyItem | null {
  const baseQuestion = context.questions.find((question) => question.id === attempt.questionId)
  if (!baseQuestion) return null
  const spec = { ...specOf(baseQuestion), category: activeCategoryOf(baseQuestion.category) }
  return { kind: 'weakness', questionId: null, spec, variantOfAttemptId: attempt.id, attemptId: null, generationError: null }
}

function retryItem(context: SelectionContext, attempt: Attempt): DailyItem | null {
  const question = context.questions.find((candidate) => candidate.id === attempt.questionId)
  if (!question) return null
  return { kind: 'retry', questionId: question.id, spec: specOf(question), variantOfAttemptId: null, retryOfAttemptId: attempt.id, attemptId: null, generationError: null }
}

/**
 * A weakness on a topic the user turned off is not brought back; it would otherwise block the ones behind it.
 * Short answers stay out because one review comes per day, and three new ones a day would crowd out essay reviews.
 */
function attemptsEligibleForWeaknessReview(context: SelectionContext): Attempt[] {
  const questionsById = new Map(context.questions.map((question) => [question.id, question]))
  return context.attempts.filter((attempt) => {
    const question = questionsById.get(attempt.questionId)
    return question !== undefined && context.topics.includes(question.topic) && !isShortAnswer(question)
  })
}

/** Topic exclusions reset when topics run out, so picked questions leave the candidates to keep one from repeating. */
function plannedShortAnswerItems(context: SelectionContext, difficulty: Difficulty): DailyItem[] {
  const items: DailyItem[] = []
  let remainingContext = context
  for (let count = 0; count < DAILY_SHORT_ANSWER_COUNT; count++) {
    const item = plannedItem(remainingContext, 'short-answer', { format: 'short-answer', difficulty }, items.map((planned) => planned.spec.topic!))
    items.push(item)
    remainingContext = { ...remainingContext, questions: remainingContext.questions.filter((question) => question.id !== item.questionId) }
  }
  return items
}

/**
 * One scenario question of the weekday's category, one concept question on a different topic,
 * then a due weakness follow-up or, when three questions are requested, another concept question.
 * A postponed question that is due comes on top of those, since the user asked for it back.
 * Short answer questions always close the set.
 */
export function planDailySet(context: SelectionContext, options: DailyPlanOptions): DailySet {
  const scenarioCategory = scenarioCategoryForWeekday(parseDateKey(options.date).getDay())
  const scenario = plannedItem(context, 'scenario', { format: 'scenario', category: scenarioCategory, difficulty: options.difficulty }, [])
  const usedTopics = [scenario.spec.topic!]
  const conceptSpec: QuestionSpec = { format: 'concept', difficulty: options.difficulty }
  const concept = plannedItem(context, 'concept', conceptSpec, usedTopics)
  usedTopics.push(concept.spec.topic!)
  const items = [scenario, concept]

  const dueAttempt = findDueWeaknessAttempt(attemptsEligibleForWeaknessReview(context), options.date)
  const followUp = dueAttempt ? weaknessItem(context, dueAttempt) : null
  if (followUp) items.push(followUp)
  else if (options.dailyCount === 3) items.push(plannedItem(context, 'concept', conceptSpec, usedTopics))

  const dueRetry = findDueRetryAttempt(context.attempts, options.date)
  const retry = dueRetry ? retryItem(context, dueRetry) : null
  if (retry) items.push(retry)
  return { date: options.date, items: [...items, ...plannedShortAnswerItems(context, options.difficulty)] }
}
