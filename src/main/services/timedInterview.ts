import type { Question, QuestionSpec, TimedInterview, TimedInterviewItem } from '@shared/types'
import type { TimedInterviewOptions } from '@shared/api'
import { difficultyLabel } from '@shared/taxonomy'
import { blankAnswerGrading, isLateSubmission, planTimedFormats, validateTimedOptions } from '../domain/interviews'
import { pickUnservedQuestion } from '../domain/selection'
import type { JobContext } from '../jobs/jobManager'
import { newId, type Repositories } from '../store/repositories'
import { buildSelectionContext, type AppContext } from './appContext'
import { createAttempt } from './daily'
import { graderQuestion, submitAttempt } from './grading'
import { generateQuestion } from './questionAuthoring'
import { listTopics, topicLabelIn } from './topics'

const INTERRUPTED_MESSAGE = '앱이 종료되어 문제 준비가 중단되었습니다. 다시 시도하세요.'
const CANCELLED_MESSAGE = '문제 준비를 취소했습니다. 다시 시도하거나 면접을 그만두세요.'

export function requireTimedInterview(repositories: Repositories, id: string): TimedInterview {
  const interview = repositories.requireInterview(id)
  if (interview.mode !== 'timed') throw new Error('제한 시간 세션이 아닙니다.')
  return interview
}

function updateTimedInterview(repositories: Repositories, id: string, change: (interview: TimedInterview) => Partial<TimedInterview>): TimedInterview {
  const interview = requireTimedInterview(repositories, id)
  const updated = { ...interview, ...change(interview) }
  repositories.saveInterview(updated)
  return updated
}

function updateItem(repositories: Repositories, id: string, itemIndex: number, changes: Partial<TimedInterviewItem>): TimedInterview {
  return updateTimedInterview(repositories, id, (interview) => ({
    items: interview.items.map((item, index) => (index === itemIndex ? { ...item, ...changes } : item)),
  }))
}

/** Served right away, so the next pick of the same session and the daily set both skip it. */
function markServed(repositories: Repositories, question: Question): void {
  if (!question.servedAt) repositories.saveQuestion({ ...question, servedAt: new Date().toISOString() })
}

function requireKnownTopic(repositories: Repositories, topic: string | undefined): void {
  if (topic && !listTopics(repositories).some((definition) => definition.value === topic)) throw new Error(`알 수 없는 주제입니다: ${topic}`)
}

/** Bank questions first; the rest keep an open spec so each generation picks its topic when its turn comes. */
function planItems(repositories: Repositories, options: TimedInterviewOptions): TimedInterviewItem[] {
  return planTimedFormats(options.format, options.questionCount).map((format) => {
    const spec: QuestionSpec = { format, difficulty: options.difficulty, ...(options.topic ? { topic: options.topic } : {}) }
    const question = pickUnservedQuestion(buildSelectionContext(repositories), spec)
    if (question) markServed(repositories, question)
    return {
      questionId: question?.id ?? null,
      spec: question ? { ...spec, category: question.category, topic: question.topic } : spec,
      attemptId: null,
      startedAt: null,
      submittedAt: null,
      timedOut: false,
    }
  })
}

function preparationLabel(repositories: Repositories, interview: TimedInterview): string {
  const topic = interview.topic ? topicLabelIn(repositories, interview.topic) : '주제 자동'
  return `모의 면접 문제 준비: ${topic} · ${difficultyLabel(interview.difficulty)} · ${interview.items.length}문제`
}

async function fillMissingQuestions(context: AppContext, job: JobContext, id: string): Promise<void> {
  const repositories = context.repositories()
  let itemIndex = requireTimedInterview(repositories, id).items.findIndex((item) => !item.questionId)
  while (itemIndex !== -1) {
    const item = requireTimedInterview(repositories, id).items[itemIndex]
    const question = await generateQuestion(context, job, { spec: item.spec })
    // Abandoned while generating: the new question stays in the bank unserved for later.
    if (requireTimedInterview(repositories, id).status !== 'preparing') return
    markServed(repositories, question)
    updateItem(repositories, id, itemIndex, { questionId: question.id, spec: { ...item.spec, category: question.category, topic: question.topic } })
    context.notifyDataChanged()
    itemIndex = requireTimedInterview(repositories, id).items.findIndex((entry) => !entry.questionId)
  }
}

/** Only an interview still waiting for its questions changes state; one abandoned meanwhile stays abandoned. */
function finishPreparation(context: AppContext, id: string, changes: Partial<TimedInterview>): void {
  const repositories = context.repositories()
  if (requireTimedInterview(repositories, id).status !== 'preparing') return
  updateTimedInterview(repositories, id, () => changes)
  context.notifyDataChanged()
}

function startPreparation(context: AppContext, interview: TimedInterview): void {
  context.jobs.start('prepare-interview', preparationLabel(context.repositories(), interview), async (job) => {
    job.setTarget(interview.id)
    await fillMissingQuestions(context, job, interview.id)
    finishPreparation(context, interview.id, { status: 'in-progress', preparationError: null, preparationErrorDetail: null })
  }, {
    onFailed: (message, detail) => finishPreparation(context, interview.id, { status: 'preparation-failed', preparationError: message, preparationErrorDetail: detail }),
    onCancelled: () => finishPreparation(context, interview.id, { status: 'preparation-failed', preparationError: CANCELLED_MESSAGE, preparationErrorDetail: null }),
  })
}

export function startTimedInterview(context: AppContext, options: TimedInterviewOptions): string {
  validateTimedOptions(options)
  const repositories = context.repositories()
  requireKnownTopic(repositories, options.topic)
  const items = planItems(repositories, options)
  const needsGeneration = items.some((item) => !item.questionId)
  const interview: TimedInterview = {
    id: newId('i'),
    mode: 'timed',
    status: needsGeneration ? 'preparing' : 'in-progress',
    topic: options.topic ?? null,
    difficulty: options.difficulty,
    format: options.format,
    timeLimitMinutes: options.timeLimitMinutes,
    items,
    preparationError: null,
    preparationErrorDetail: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  }
  repositories.saveInterview(interview)
  if (needsGeneration) startPreparation(context, interview)
  context.notifyDataChanged()
  return interview.id
}

export function retryInterviewPreparation(context: AppContext, id: string): void {
  const repositories = context.repositories()
  const interview = requireTimedInterview(repositories, id)
  if (interview.status !== 'preparation-failed') throw new Error('문제 준비에 실패한 면접만 다시 준비할 수 있습니다.')
  if (context.jobs.isRunningFor('prepare-interview', id)) return
  const preparing = updateTimedInterview(repositories, id, () => ({ status: 'preparing', preparationError: null, preparationErrorDetail: null }))
  startPreparation(context, preparing)
  context.notifyDataChanged()
}

function currentItemIndex(interview: TimedInterview): number {
  return interview.items.findIndex((item) => !item.submittedAt)
}

function requireInProgress(interview: TimedInterview): number {
  if (interview.status !== 'in-progress') throw new Error('진행 중인 면접이 아닙니다.')
  const itemIndex = currentItemIndex(interview)
  if (itemIndex === -1) throw new Error('남은 문제가 없습니다.')
  return itemIndex
}

/** The attempt is created only when the user starts the item, so the timer and the attempt begin together. */
export function beginTimedItem(context: AppContext, id: string): void {
  const repositories = context.repositories()
  const interview = requireTimedInterview(repositories, id)
  const itemIndex = requireInProgress(interview)
  const item = interview.items[itemIndex]
  if (item.startedAt) return
  if (!item.questionId) throw new Error('아직 문제가 준비되지 않았습니다.')
  const attempt = createAttempt(repositories, repositories.requireQuestion(item.questionId), 'interview')
  repositories.updateAttempt(attempt.id, () => ({ interviewId: id }))
  updateItem(repositories, id, itemIndex, { attemptId: attempt.id, startedAt: new Date().toISOString() })
  context.notifyDataChanged()
}

function saveBlankGrading(context: AppContext, attemptId: string, submittedAt: string): void {
  const repositories = context.repositories()
  const question = repositories.requireQuestion(repositories.requireAttempt(attemptId).questionId)
  const grading = blankAnswerGrading(graderQuestion(question), context.settings().runner, submittedAt)
  repositories.updateAttempt(attemptId, () => ({ answer: '', status: 'graded', submittedAt, grading, gradingError: null, gradingErrorDetail: null }))
}

/**
 * Grading starts right away in the background, so results are ready soon after the last item; the screen keeps them
 * hidden until the session ends. Late submissions are accepted (the app may have been closed) but marked timed out.
 */
export function submitTimedItem(context: AppContext, id: string, answer: string, timedOut: boolean): void {
  const repositories = context.repositories()
  const interview = requireTimedInterview(repositories, id)
  const itemIndex = requireInProgress(interview)
  const item = interview.items[itemIndex]
  if (!item.startedAt || !item.attemptId) throw new Error('아직 시작하지 않은 문제입니다.')
  const now = new Date()
  if (answer.trim()) submitAttempt(context, item.attemptId, answer)
  else saveBlankGrading(context, item.attemptId, now.toISOString())
  const isLate = timedOut || isLateSubmission(item.startedAt, interview.timeLimitMinutes, now)
  const updated = updateItem(repositories, id, itemIndex, { submittedAt: now.toISOString(), timedOut: isLate })
  if (currentItemIndex(updated) === -1) updateTimedInterview(repositories, id, () => ({ status: 'submitted', completedAt: now.toISOString() }))
  context.notifyDataChanged()
}

/** A question nobody wrote an answer for goes back to the bank, so abandoning a session does not use it up. */
function releaseUnanswered(repositories: Repositories, questionId: string | null): void {
  if (!questionId || repositories.attempts.readAll().some((attempt) => attempt.questionId === questionId)) return
  const question = repositories.questions.read(questionId)
  if (!question?.servedAt) return
  const { servedAt: _servedAt, ...unserved } = question
  repositories.saveQuestion(unserved)
}

/** Keeps the submitted items as the result; the unfinished draft is discarded and unstarted items are dropped. */
export function abandonTimedInterview(context: AppContext, interview: TimedInterview): void {
  if (interview.status === 'submitted' || interview.status === 'abandoned') throw new Error('이미 끝난 면접입니다.')
  const repositories = context.repositories()
  for (const job of context.jobs.list()) {
    if (job.kind === 'prepare-interview' && job.status === 'running' && job.targetId === interview.id) context.jobs.cancel(job.id)
  }
  const unfinished = interview.items.filter((item) => !item.submittedAt)
  for (const item of unfinished) if (item.attemptId) repositories.attempts.remove(item.attemptId)
  for (const item of unfinished) releaseUnanswered(repositories, item.questionId)
  repositories.saveInterview({ ...interview, status: 'abandoned', items: interview.items.filter((item) => item.submittedAt), completedAt: new Date().toISOString() })
}

/** Preparation jobs live in memory, so a session left preparing by a previous run can never finish on its own. */
export function recoverInterruptedTimedInterview(repositories: Repositories, interview: TimedInterview): void {
  if (interview.status !== 'preparing') return
  repositories.saveInterview({ ...interview, status: 'preparation-failed', preparationError: INTERRUPTED_MESSAGE, preparationErrorDetail: null })
}
