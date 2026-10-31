import type { Attempt, AttemptOrigin, DailyItem, DailySet, Question } from '@shared/types'
import type { TodayView } from '@shared/api'
import { addDays, localDateKey } from '../domain/dates'
import { planDailySet } from '../domain/selection'
import { errorDetailOf, errorMessageOf, type JobContext } from '../jobs/jobManager'
import { CancelledError } from '../llm/skillRunner'
import { newId, type Repositories } from '../store/repositories'
import { buildSelectionContext, type AppContext } from './appContext'
import { generateQuestion, type VariantSource } from './questionAuthoring'

const NO_GENERATION_ERROR = { generationError: null, generationErrorDetail: null } satisfies Partial<DailyItem>

export function todayKey(): string {
  return localDateKey(new Date())
}

function markServed(repositories: Repositories, questionId: string): void {
  const question = repositories.requireQuestion(questionId)
  if (question.servedAt) return
  repositories.saveQuestion({ ...question, servedAt: new Date().toISOString() })
}

function planDailySetFor(context: AppContext, date: string): DailySet {
  const { difficulty, dailyCount } = context.settings()
  return planDailySet(buildSelectionContext(context.repositories()), { date, difficulty, dailyCount })
}

function requireDailySet(repositories: Repositories, date: string): DailySet {
  const dailySet = repositories.dailySets.read(date)
  if (!dailySet) throw new Error(`오늘의 문제 세트를 찾을 수 없습니다: ${date}`)
  return dailySet
}

/** Plans the day's set once; later calls return the stored set so the day's questions never change. */
export function ensureDailySet(context: AppContext, date: string): DailySet {
  const repositories = context.repositories()
  const existing = repositories.dailySets.read(date)
  if (existing) return existing
  const dailySet = planDailySetFor(context, date)
  for (const item of dailySet.items) if (item.questionId) markServed(repositories, item.questionId)
  repositories.saveDailySet(dailySet)
  return dailySet
}

export function getTodayView(context: AppContext): TodayView {
  const repositories = context.repositories()
  const dailySet = ensureDailySet(context, todayKey())
  const items = dailySet.items.map((item) => ({
    ...item,
    question: item.questionId ? repositories.questions.read(item.questionId) : null,
    attempt: item.attemptId ? repositories.attempts.read(item.attemptId) : null,
  }))
  return { date: dailySet.date, items, isPreparing: context.jobs.isRunning('prepare-daily') }
}

function variantSourceFor(repositories: Repositories, item: DailyItem): VariantSource | null {
  if (!item.variantOfAttemptId) return null
  const attempt = repositories.requireAttempt(item.variantOfAttemptId)
  const weakPoints = (attempt.grading?.requiredCoverage ?? []).filter((coverage) => coverage.status !== 'full').map((coverage) => coverage.point)
  return { baseQuestion: repositories.requireQuestion(attempt.questionId), weakPoints }
}

function recordWeaknessFollowUp(repositories: Repositories, item: DailyItem): void {
  if (!item.variantOfAttemptId) return
  const attempt = repositories.requireAttempt(item.variantOfAttemptId)
  repositories.saveAttempt({ ...attempt, weaknessFollowUps: attempt.weaknessFollowUps + 1 })
}

/** A failed item keeps its error for the Today screen's retry button; the remaining items still get generated. */
async function fillPendingItem(context: AppContext, job: JobContext, date: string, itemIndex: number): Promise<void> {
  const repositories = context.repositories()
  const item = requireDailySet(repositories, date).items[itemIndex]
  try {
    const question = await generateQuestion(context, job, { spec: item.spec, variant: variantSourceFor(repositories, item) })
    markServed(repositories, question.id)
    recordWeaknessFollowUp(repositories, item)
    updateDailyItem(repositories, date, itemIndex, { questionId: question.id, ...NO_GENERATION_ERROR })
  } catch (error) {
    if (error instanceof CancelledError) throw error
    updateDailyItem(repositories, date, itemIndex, { generationError: generationErrorMessage(error), generationErrorDetail: errorDetailOf(error) })
  } finally {
    context.notifyDataChanged()
  }
}

// An empty message would read as "no error" and send the item back to the pending list forever.
function generationErrorMessage(error: unknown): string {
  return errorMessageOf(error) || '알 수 없는 오류로 문제를 만들지 못했습니다.'
}

function updateDailyItem(repositories: Repositories, date: string, itemIndex: number, changes: Partial<DailyItem>): void {
  const dailySet = requireDailySet(repositories, date)
  dailySet.items[itemIndex] = { ...dailySet.items[itemIndex], ...changes }
  repositories.saveDailySet(dailySet)
}

function nextPendingIndex(repositories: Repositories, date: string): number {
  return requireDailySet(repositories, date).items.findIndex((item) => !item.questionId && !item.generationError)
}

/** Re-reads the set before every item, so an item whose error was cleared by a retry is picked up by this run. */
async function fillPendingItems(context: AppContext, job: JobContext, date: string): Promise<number[]> {
  const attemptedIndexes: number[] = []
  let itemIndex = nextPendingIndex(context.repositories(), date)
  while (itemIndex !== -1) {
    await fillPendingItem(context, job, date, itemIndex)
    attemptedIndexes.push(itemIndex)
    itemIndex = nextPendingIndex(context.repositories(), date)
  }
  return attemptedIndexes
}

/** Generates tomorrow's questions into the bank ahead of time without fixing tomorrow's set. */
async function prefetchTomorrow(context: AppContext, job: JobContext, today: string): Promise<void> {
  const tomorrowPlan = planDailySetFor(context, addDays(today, 1))
  const missing = tomorrowPlan.items.filter((item) => !item.questionId && item.kind !== 'weakness')
  for (const item of missing) {
    job.setStage('내일 문제를 미리 준비하는 중')
    await generateQuestion(context, job, { spec: item.spec })
  }
}

// Tomorrow's questions are only a head start; tomorrow's own preparation generates whatever is still missing.
async function prefetchTomorrowIgnoringFailure(context: AppContext, job: JobContext, today: string): Promise<void> {
  try {
    await prefetchTomorrow(context, job, today)
  } catch (error) {
    if (error instanceof CancelledError) throw error
  }
}

function throwIfAnyItemFailed(repositories: Repositories, date: string, attemptedIndexes: number[]): void {
  const items = requireDailySet(repositories, date).items
  const failedCount = new Set(attemptedIndexes.filter((itemIndex) => items[itemIndex].generationError)).size
  if (failedCount === 0) return
  throw new Error(`오늘의 문제 ${failedCount}개를 만들지 못했습니다. 오늘 화면에서 다시 시도하세요.`)
}

async function prepareDailyWork(context: AppContext, job: JobContext): Promise<void> {
  const today = todayKey()
  ensureDailySet(context, today)
  const attemptedIndexes = await fillPendingItems(context, job, today)
  await prefetchTomorrowIgnoringFailure(context, job, today)
  // A retry pressed while tomorrow was being prepared only cleared the error; this run is the one that must generate it.
  attemptedIndexes.push(...(await fillPendingItems(context, job, today)))
  throwIfAnyItemFailed(context.repositories(), today, attemptedIndexes)
}

export function prepareDaily(context: AppContext): void {
  if (context.jobs.isRunning('prepare-daily')) return
  context.jobs.start('prepare-daily', '오늘의 문제 준비', (job) => prepareDailyWork(context, job), {
    onSucceeded: context.notifyDataChanged,
    onFailed: context.notifyDataChanged,
  })
}

export function retryDailyItem(context: AppContext, date: string, itemIndex: number): void {
  updateDailyItem(context.repositories(), date, itemIndex, NO_GENERATION_ERROR)
  prepareDaily(context)
}

export function createAttempt(repositories: Repositories, question: Question, origin: AttemptOrigin): Attempt {
  const now = new Date().toISOString()
  const attempt: Attempt = {
    id: newId('a'), questionId: question.id, origin, date: todayKey(), answer: '', status: 'draft',
    createdAt: now, draftSavedAt: null, submittedAt: null, grading: null, gradingError: null, weaknessFollowUps: 0,
  }
  repositories.saveAttempt(attempt)
  return attempt
}

export function startDailyAttempt(context: AppContext, date: string, itemIndex: number): string {
  const repositories = context.repositories()
  const item = repositories.dailySets.read(date)?.items[itemIndex]
  if (!item?.questionId) throw new Error('아직 문제가 준비되지 않았습니다.')
  if (item.attemptId) return item.attemptId
  const attempt = createAttempt(repositories, repositories.requireQuestion(item.questionId), 'daily')
  updateDailyItem(repositories, date, itemIndex, { attemptId: attempt.id })
  return attempt.id
}
