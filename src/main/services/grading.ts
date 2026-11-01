import type { Attempt, GradingResult, Question, QuestionContent } from '@shared/types'
import { applyHintPenalty, computeTotalScore, hintPenaltyFor } from '../domain/scoring'
import { runSkill } from '../llm/skillRunner'
import type { JobContext } from '../jobs/jobManager'
import type { Repositories } from '../store/repositories'
import type { AppContext } from './appContext'

const INTERRUPTED_MESSAGE = '앱이 종료되어 채점이 중단되었습니다. 다시 채점해 주세요.'
const CANCELLED_INTERVIEW_MESSAGE = '채점을 취소했습니다. 모의 면접 답안은 고칠 수 없으니 다시 채점하세요.'

/** The question as the grader skill sees it: content with rubric and model answer, without bank metadata. */
export function graderQuestion(question: Question): QuestionContent {
  const { id, source, reviewStatus, createdAt, variantOf, servedAt, ...content } = question
  return content
}

function gradingPayload(question: Question, answer: string): object {
  return { mode: 'grade', question: graderQuestion(question), answer }
}

async function gradeWork(context: AppContext, job: JobContext, attemptId: string): Promise<void> {
  const repositories = context.repositories()
  const attempt = repositories.requireAttempt(attemptId)
  const question = repositories.requireQuestion(attempt.questionId)
  const result = await runSkill<GradingResult>({
    skill: 'daily-study-grader',
    schema: 'grading-result',
    payload: gradingPayload(question, attempt.answer),
    settings: context.settings(),
    signal: job.signal,
    onStage: job.setStage,
  })
  const hintCount = attempt.hints?.length ?? 0
  const totalScore = applyHintPenalty(computeTotalScore(question, result), hintCount)
  const grading = { ...result, totalScore, hintPenalty: hintPenaltyFor(hintCount), gradedAt: new Date().toISOString(), runner: context.settings().runner }
  repositories.saveAttempt({ ...repositories.requireAttempt(attemptId), status: 'graded', grading, ...NO_GRADING_ERROR })
}

const NO_GRADING_ERROR = { gradingError: null, gradingErrorDetail: null } satisfies Partial<Attempt>

function updateAttempt(repositories: Repositories, attemptId: string, changes: Partial<Attempt>): void {
  repositories.saveAttempt({ ...repositories.requireAttempt(attemptId), ...changes })
}

function updateAttemptAndNotify(context: AppContext, attemptId: string, changes: Partial<Attempt>): void {
  updateAttempt(context.repositories(), attemptId, changes)
  context.notifyDataChanged()
}

function startGradingJob(context: AppContext, attemptId: string): string {
  const repositories = context.repositories()
  const title = repositories.requireQuestion(repositories.requireAttempt(attemptId).questionId).title
  const jobId = context.jobs.start('grade-answer', `채점: ${title}`, async (job) => {
    job.setTarget(attemptId)
    await gradeWork(context, job, attemptId)
  }, {
    onSucceeded: context.notifyDataChanged,
    onFailed: (message, detail) => updateAttemptAndNotify(context, attemptId, { status: 'grading-failed', gradingError: message, gradingErrorDetail: detail }),
    onCancelled: () => updateAttemptAndNotify(context, attemptId, cancelledGradingChanges(context.repositories().requireAttempt(attemptId))),
  })
  return jobId
}

/** A mock interview answer stays submitted once its time is up, so cancelling only leaves it waiting to be graded again. */
function cancelledGradingChanges(attempt: Attempt): Partial<Attempt> {
  if (attempt.origin === 'interview') return { status: 'grading-failed', gradingError: CANCELLED_INTERVIEW_MESSAGE, gradingErrorDetail: null }
  return { status: 'draft', submittedAt: null }
}

/** Locks the answer and starts grading in the background; cancelling returns the attempt to draft (except in mock interviews). */
export function submitAttempt(context: AppContext, attemptId: string, answer: string): string {
  const repositories = context.repositories()
  const attempt = repositories.requireAttempt(attemptId)
  if (attempt.status === 'graded' || attempt.status === 'grading') throw new Error('이미 제출한 답안입니다.')
  if (!answer.trim()) throw new Error('답안을 입력하세요.')
  updateAttemptAndNotify(context, attemptId, { answer, status: 'grading', submittedAt: new Date().toISOString(), ...NO_GRADING_ERROR })
  return startGradingJob(context, attemptId)
}

export function retryGrading(context: AppContext, attemptId: string): string {
  const repositories = context.repositories()
  if (repositories.requireAttempt(attemptId).status !== 'grading-failed') throw new Error('채점에 실패한 답안만 다시 채점할 수 있습니다.')
  updateAttemptAndNotify(context, attemptId, { status: 'grading', ...NO_GRADING_ERROR })
  return startGradingJob(context, attemptId)
}

/** Grading jobs live in memory, so attempts left in "grading" by a previous run can never finish on their own. */
export function recoverInterruptedGradings(repositories: Repositories): void {
  for (const attempt of repositories.attempts.readAll()) {
    if (attempt.status === 'grading') updateAttempt(repositories, attempt.id, { status: 'grading-failed', gradingError: INTERRUPTED_MESSAGE })
  }
}
