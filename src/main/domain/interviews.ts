import type {
  ConversationInterview,
  InterviewMessage,
  InterviewMessageKind,
  InterviewReport,
  QuestionContent,
  QuestionFormat,
  RunnerKind,
  ScoredGrading,
  TimedInterviewFormat,
} from '@shared/types'
import type { ConversationInterviewOptions, TimedInterviewOptions } from '@shared/api'
import { CONVERSATION_INTERVIEW_LIMITS, TIMED_INTERVIEW_LIMITS } from '@shared/rules'
import { DIFFICULTIES } from '@shared/taxonomy'

export type TurnAction = 'main-question' | 'follow-up' | 'finish'

export const CLOSING_MESSAGE = '오늘 면접은 여기까지입니다. 성실하게 답변해 주셔서 감사합니다. 지금까지의 답변을 바탕으로 평가를 정리해 드리겠습니다.'

// The renderer submits at 0 seconds; this covers the round trip so an on-time submission is not marked late.
const LATE_SUBMISSION_GRACE_MILLISECONDS = 5_000
const MAX_STUDY_RECOMMENDATIONS = 5
const MAX_REPORT_SCORE = 100

const TIMED_FORMATS: readonly TimedInterviewFormat[] = ['scenario', 'concept', 'mixed']
const MESSAGE_KINDS: Record<TurnAction, InterviewMessageKind> = { 'main-question': 'main', 'follow-up': 'follow-up', finish: 'closing' }

type Range = { min: number; max: number }

function isWithin(value: number, range: Range): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max
}

function requireDifficulty(difficulty: string): void {
  if (!DIFFICULTIES.some((entry) => entry.value === difficulty)) throw new Error('난이도 값이 올바르지 않습니다.')
}

export function validateTimedOptions(options: TimedInterviewOptions): void {
  const { questionCount, timeLimitMinutes } = TIMED_INTERVIEW_LIMITS
  requireDifficulty(options.difficulty)
  if (!TIMED_FORMATS.includes(options.format)) throw new Error('문제 형식 값이 올바르지 않습니다.')
  if (!isWithin(options.questionCount, questionCount)) throw new Error(`문제 수는 ${questionCount.min}~${questionCount.max}개 사이로 고르세요.`)
  if (!isWithin(options.timeLimitMinutes, timeLimitMinutes)) throw new Error(`제한 시간은 ${timeLimitMinutes.min}~${timeLimitMinutes.max}분 사이로 고르세요.`)
}

export function validateConversationOptions(options: ConversationInterviewOptions): void {
  const { mainQuestionCount, maxFollowUps } = CONVERSATION_INTERVIEW_LIMITS
  requireDifficulty(options.difficulty)
  if (!isWithin(options.mainQuestionCount, mainQuestionCount)) throw new Error(`본 질문 수는 ${mainQuestionCount.min}~${mainQuestionCount.max}개 사이로 고르세요.`)
  if (!isWithin(options.maxFollowUps, maxFollowUps)) throw new Error(`꼬리 질문 수는 ${maxFollowUps.min}~${maxFollowUps.max}개 사이로 고르세요.`)
}

/** A mixed session alternates formats, starting with a scenario like the daily set does. */
export function planTimedFormats(format: TimedInterviewFormat, count: number): QuestionFormat[] {
  return Array.from({ length: count }, (_, index) => (format === 'mixed' ? (index % 2 === 0 ? 'scenario' : 'concept') : format))
}

export function isLateSubmission(startedAt: string, timeLimitMinutes: number, submittedAt: Date): boolean {
  return submittedAt.getTime() - new Date(startedAt).getTime() > timeLimitMinutes * 60_000 + LATE_SUBMISSION_GRACE_MILLISECONDS
}

export function messageKindOf(action: TurnAction): InterviewMessageKind {
  return MESSAGE_KINDS[action]
}

export function countTurns(messages: InterviewMessage[]): { mainQuestionsAsked: number; followUpsInCurrentQuestion: number } {
  let mainQuestionsAsked = 0
  let followUpsInCurrentQuestion = 0
  for (const message of messages) {
    if (message.role !== 'interviewer') continue
    if (message.kind === 'main') {
      mainQuestionsAsked++
      followUpsInCurrentQuestion = 0
    }
    if (message.kind === 'follow-up') followUpsInCurrentQuestion++
  }
  return { mainQuestionsAsked, followUpsInCurrentQuestion }
}

/** What the interviewer may do next, so the session stays within the counts the user picked. */
export function allowedTurnActions(interview: Pick<ConversationInterview, 'messages' | 'mainQuestionCount' | 'maxFollowUps'>): TurnAction[] {
  const { mainQuestionsAsked, followUpsInCurrentQuestion } = countTurns(interview.messages)
  if (mainQuestionsAsked === 0) return ['main-question']
  const allowed: TurnAction[] = []
  if (followUpsInCurrentQuestion < interview.maxFollowUps) allowed.push('follow-up')
  allowed.push(mainQuestionsAsked < interview.mainQuestionCount ? 'main-question' : 'finish')
  return allowed
}

export interface ResolvedTurn {
  action: TurnAction
  /** The model's text was a question, but the session has to end here, so a fixed closing line replaces it. */
  useClosingMessage: boolean
}

/**
 * Keeps the counts even when the model picks an action it was not offered. A question it asked is still used as a
 * question when some question is allowed; an early finish has no question to fall back on, so it cannot be resolved.
 */
export function resolveTurnAction(allowed: TurnAction[], requested: TurnAction): ResolvedTurn | null {
  if (allowed.includes(requested)) return { action: requested, useClosingMessage: false }
  if (requested === 'finish') return null
  const otherQuestion: TurnAction = requested === 'follow-up' ? 'main-question' : 'follow-up'
  if (allowed.includes(otherQuestion)) return { action: otherQuestion, useClosingMessage: false }
  return { action: 'finish', useClosingMessage: true }
}

function clampScore(score: number): number {
  return Math.round(Math.min(MAX_REPORT_SCORE, Math.max(0, score)))
}

export function normalizeReport(report: InterviewReport): InterviewReport {
  return {
    ...report,
    overallScore: clampScore(report.overallScore),
    questions: report.questions.map((question) => ({ ...question, score: clampScore(question.score) })),
  }
}

/** A blank answer has nothing to grade, so it gets a zero result without spending a model call. */
export function blankAnswerGrading(question: QuestionContent, runner: RunnerKind, gradedAt: string): ScoredGrading {
  return {
    requiredCoverage: question.rubric.required.map((item) => ({ point: item.point, status: 'missing', comment: '답안을 작성하지 않았습니다.' })),
    bonusMatched: [],
    deductionsApplied: [],
    perspectiveScores: question.perspectives.map((perspective) => ({ perspective, score: 0, comment: '답안이 없어 평가할 수 없습니다.' })),
    strengths: [],
    weaknesses: [{
      summary: '답안을 작성하지 않았습니다.',
      quote: '',
      improvement: '시간이 부족할 때는 요구 사항마다 핵심 주장 한 문장부터 적고 근거를 덧붙이면 부분 점수를 받을 수 있습니다.',
    }],
    studyRecommendations: question.relatedStudyTopics.slice(0, MAX_STUDY_RECOMMENDATIONS).map((topic) => ({
      keyword: topic,
      reason: '답안을 쓰지 못한 문제의 연관 학습 주제입니다.',
      searchQuery: topic,
    })),
    overallComment: '답안을 작성하지 않아 0점입니다. 모범 답안과 채점 기준을 읽고, 같은 주제의 문제를 다시 풀어 보세요.',
    totalScore: 0,
    hintPenalty: 0,
    gradedAt,
    runner,
  }
}
