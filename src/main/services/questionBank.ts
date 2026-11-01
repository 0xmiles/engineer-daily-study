import type { AttemptOrigin, Question, QuestionSpec, ReviewStatus } from '@shared/types'
import type { ManualQuestionInput, StartResult } from '@shared/api'
import { categoryLabel, difficultyLabel } from '@shared/taxonomy'
import { addDays } from '../domain/dates'
import { pickUnservedQuestion } from '../domain/selection'
import type { JobContext } from '../jobs/jobManager'
import type { Repositories } from '../store/repositories'
import { buildSelectionContext, type AppContext } from './appContext'
import { createAttempt, todayKey } from './daily'
import { draftRubricForManualQuestion, generateQuestion } from './questionAuthoring'
import { topicLabelIn } from './topics'

const MAX_GENERATE_COUNT = 5
const PRACTICE_JOB_ACTION = '추가 문제 생성'
const BANK_JOB_ACTION = '문제 은행에 추가'

/** Topic and category stay open until the generation turn comes, so the label is completed then. */
function jobLabel(context: AppContext, action: string, spec: QuestionSpec): string {
  const topic = spec.topic ? topicLabelIn(context.repositories(), spec.topic) : '주제 자동'
  const category = spec.category ? categoryLabel(spec.category) : '유형 자동'
  return `${action}: ${topic} · ${category} · ${difficultyLabel(spec.difficulty)}`
}

function generateLabelledQuestion(context: AppContext, job: JobContext, action: string, spec: QuestionSpec): Promise<Question> {
  return generateQuestion(context, job, { spec, onSpecResolved: (concreteSpec) => job.setLabel(jobLabel(context, action, concreteSpec)) })
}

function markServedAndStart(context: AppContext, questionId: string, origin: AttemptOrigin): string {
  const repositories = context.repositories()
  const question = repositories.requireQuestion(questionId)
  const served = question.servedAt ? question : { ...question, servedAt: new Date().toISOString() }
  repositories.saveQuestion(served)
  return createAttempt(repositories, served, origin).id
}

/** Serves an unserved bank question immediately, or generates one in the background. */
export function requestPractice(context: AppContext, spec: QuestionSpec): StartResult {
  const question = pickUnservedQuestion(buildSelectionContext(context.repositories()), spec)
  if (question) {
    const attemptId = markServedAndStart(context, question.id, 'practice')
    context.notifyDataChanged()
    return { kind: 'ready', targetId: attemptId }
  }
  const jobId = context.jobs.start('practice-question', jobLabel(context, PRACTICE_JOB_ACTION, spec), async (job) => {
    const generated = await generateLabelledQuestion(context, job, PRACTICE_JOB_ACTION, spec)
    job.setTarget(markServedAndStart(context, generated.id, 'practice'))
  }, { onSucceeded: context.notifyDataChanged })
  return { kind: 'job', jobId }
}

export function generateQuestions(context: AppContext, spec: QuestionSpec, count: number): string[] {
  const jobIds: string[] = []
  for (let index = 0; index < Math.min(count, MAX_GENERATE_COUNT); index++) {
    const jobId = context.jobs.start('generate-question', jobLabel(context, BANK_JOB_ACTION, spec), async (job) => {
      job.setTarget((await generateLabelledQuestion(context, job, BANK_JOB_ACTION, spec)).id)
    }, { onSucceeded: context.notifyDataChanged })
    jobIds.push(jobId)
  }
  return jobIds
}

export function createManualQuestion(context: AppContext, input: ManualQuestionInput): string {
  return context.jobs.start('draft-rubric', `직접 입력한 문제의 채점 기준 작성: ${input.title}`, async (job) => {
    job.setTarget((await draftRubricForManualQuestion(context, job, input)).id)
  }, { onSucceeded: context.notifyDataChanged })
}

export function startAttempt(context: AppContext, questionId: string, origin: AttemptOrigin): string {
  const repositories = context.repositories()
  const draft = repositories.attempts.readAll().find((attempt) => attempt.questionId === questionId && attempt.status === 'draft')
  const attemptId = draft ? draft.id : markServedAndStart(context, questionId, origin)
  context.notifyDataChanged()
  return attemptId
}

export function setReviewStatus(context: AppContext, id: string, reviewStatus: ReviewStatus): void {
  const repositories = context.repositories()
  repositories.saveQuestion({ ...repositories.requireQuestion(id), reviewStatus })
  context.notifyDataChanged()
}

export function deleteQuestion(context: AppContext, id: string): void {
  const repositories = context.repositories()
  const attempts = repositories.attempts.readAll()
  // readAll skips unreadable files, and one of them could be an attempt on this question.
  if (attempts.length < repositories.attempts.keys().length) {
    throw new Error('읽을 수 없는 풀이 파일이 있어 문제를 삭제할 수 없습니다. 데이터 폴더의 attempts 폴더를 확인하세요.')
  }
  if (attempts.some((attempt) => attempt.questionId === id)) {
    throw new Error('풀이 기록이 있는 문제는 삭제할 수 없습니다. 기록을 보존하기 위해서입니다.')
  }
  if (isInUpcomingDailySet(repositories, id)) {
    throw new Error('오늘이나 내일의 문제로 정해진 문제는 삭제할 수 없습니다. 오늘의 문제 카드가 비지 않게 하기 위해서입니다.')
  }
  repositories.questions.remove(id)
  context.notifyDataChanged()
}

function isInUpcomingDailySet(repositories: Repositories, questionId: string): boolean {
  const today = todayKey()
  return [today, addDays(today, 1)].some((date) => repositories.dailySets.read(date)?.items.some((item) => item.questionId === questionId))
}

export function saveDraft(context: AppContext, attemptId: string, answer: string) {
  const repositories = context.repositories()
  const attempt = repositories.requireAttempt(attemptId)
  if (attempt.status !== 'draft') throw new Error('제출한 답안은 수정할 수 없습니다.')
  const saved = { ...attempt, answer, draftSavedAt: new Date().toISOString() }
  repositories.saveAttempt(saved)
  return saved
}
