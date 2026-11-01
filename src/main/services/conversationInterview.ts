import type { ConversationInterview, InterviewMessage, InterviewReport, Topic } from '@shared/types'
import type { ConversationInterviewOptions } from '@shared/api'
import { difficultyLabel } from '@shared/taxonomy'
import {
  CLOSING_MESSAGE,
  allowedTurnActions,
  countTurns,
  messageKindOf,
  normalizeReport,
  resolveTurnAction,
  validateConversationOptions,
  type TurnAction,
} from '../domain/interviews'
import { runSkill } from '../llm/skillRunner'
import type { JobContext } from '../jobs/jobManager'
import { newId, type Repositories } from '../store/repositories'
import type { AppContext } from './appContext'
import { listTopics, topicLabelIn } from './topics'

const MAX_PREVIOUS_INTERVIEWS = 30
const MAX_PREVIOUS_QUESTIONS = 60

interface InterviewTurn {
  assessment: string
  action: TurnAction
  message: string
}

export function requireConversationInterview(repositories: Repositories, id: string): ConversationInterview {
  const interview = repositories.requireInterview(id)
  if (interview.mode !== 'conversation') throw new Error('대화형 면접이 아닙니다.')
  return interview
}

function saveConversation(context: AppContext, interview: ConversationInterview): void {
  context.repositories().saveInterview(interview)
  context.notifyDataChanged()
}

function topicDefinitionsFor(repositories: Repositories, topic: Topic | null): object {
  const definitions = listTopics(repositories)
  const describe = ({ value, label, description }: { value: Topic; label: string; description: string }) => ({ value, label, description })
  if (topic) return { topic: describe(definitions.find((definition) => definition.value === topic) ?? { value: topic, label: topic, description: '' }), availableTopics: [] }
  return { topic: null, availableTopics: definitions.filter((definition) => definition.enabled).map(describe) }
}

/** Main questions from earlier conversations, newest first, so the interviewer does not ask the same ones again. */
function previousMainQuestions(repositories: Repositories, currentId: string): string[] {
  return repositories.interviews.readAll()
    .filter((interview): interview is ConversationInterview => interview.mode === 'conversation' && interview.id !== currentId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_PREVIOUS_INTERVIEWS)
    .flatMap((interview) => interview.messages.filter((message) => message.role === 'interviewer' && message.kind === 'main').map((message) => message.text))
    .slice(0, MAX_PREVIOUS_QUESTIONS)
}

function transcript(messages: InterviewMessage[]): object[] {
  return messages.map(({ role, text, kind, assessment }) => ({ role, text, ...(kind ? { kind } : {}), ...(assessment ? { assessment } : {}) }))
}

function turnPayload(repositories: Repositories, interview: ConversationInterview, allowedActions: TurnAction[]): object {
  return {
    mode: 'next-turn',
    ...topicDefinitionsFor(repositories, interview.topic),
    difficulty: interview.difficulty,
    mainQuestionCount: interview.mainQuestionCount,
    maxFollowUps: interview.maxFollowUps,
    ...countTurns(interview.messages),
    allowedActions,
    messages: transcript(interview.messages),
    previousMainQuestions: previousMainQuestions(repositories, interview.id),
  }
}

function reportPayload(repositories: Repositories, interview: ConversationInterview): object {
  return { mode: 'final-report', ...topicDefinitionsFor(repositories, interview.topic), difficulty: interview.difficulty, messages: transcript(interview.messages) }
}

function jobLabel(repositories: Repositories, action: string, interview: ConversationInterview): string {
  const topic = interview.topic ? topicLabelIn(repositories, interview.topic) : '주제 자동'
  return `${action}: ${topic} · ${difficultyLabel(interview.difficulty)}`
}

function runInterviewer<T>(context: AppContext, job: JobContext, schema: 'interview-turn' | 'interview-report', payload: object): Promise<T> {
  return runSkill<T>({ skill: 'daily-study-interviewer', schema, payload, settings: context.settings(), signal: job.signal, onStage: job.setStage })
}

/** The assessment belongs to the answer the interviewer just heard; the opening turn has no answer to assess. */
function withAssessment(messages: InterviewMessage[], assessment: string): InterviewMessage[] {
  const last = messages.at(-1)
  if (last?.role !== 'candidate' || !assessment.trim()) return messages
  return [...messages.slice(0, -1), { ...last, assessment: assessment.trim() }]
}

function closingMessage(): InterviewMessage {
  return { role: 'interviewer', text: CLOSING_MESSAGE, at: new Date().toISOString(), kind: 'closing' }
}

/** A turn that comes back after the user finished or abandoned the interview is dropped. */
function applyTurn(context: AppContext, id: string, allowedActions: TurnAction[], turn: InterviewTurn): void {
  const interview = requireConversationInterview(context.repositories(), id)
  if (interview.status !== 'in-progress') return
  const resolved = resolveTurnAction(allowedActions, turn.action)
  if (!resolved) throw new Error('면접관이 아직 남은 질문이 있는데 면접을 끝내려 했습니다. 다시 시도하세요.')
  const text = resolved.useClosingMessage ? CLOSING_MESSAGE : turn.message.trim()
  const message: InterviewMessage = { role: 'interviewer', text, at: new Date().toISOString(), kind: messageKindOf(resolved.action) }
  const messages = [...withAssessment(interview.messages, turn.assessment), message]
  const isFinished = resolved.action === 'finish'
  saveConversation(context, { ...interview, messages, status: isFinished ? 'reporting' : 'in-progress' })
  if (isFinished) startReport(context, id)
}

function startTurn(context: AppContext, id: string): void {
  const repositories = context.repositories()
  if (context.jobs.isRunningFor('interview-turn', id)) throw new Error('면접관이 답변을 준비하는 중입니다. 잠시 기다려 주세요.')
  const interview = requireConversationInterview(repositories, id)
  context.jobs.start('interview-turn', jobLabel(repositories, '대화형 면접', interview), async (job) => {
    job.setTarget(id)
    const current = requireConversationInterview(context.repositories(), id)
    const allowedActions = allowedTurnActions(current)
    job.setStage('면접관이 다음 질문을 고르는 중')
    const turn = await runInterviewer<InterviewTurn>(context, job, 'interview-turn', turnPayload(context.repositories(), current, allowedActions))
    applyTurn(context, id, allowedActions, turn)
  }, { onFailed: context.notifyDataChanged, onCancelled: context.notifyDataChanged })
}

function startReport(context: AppContext, id: string): void {
  const repositories = context.repositories()
  if (context.jobs.isRunningFor('interview-report', id)) return
  const interview = requireConversationInterview(repositories, id)
  context.jobs.start('interview-report', jobLabel(repositories, '면접 평가', interview), async (job) => {
    job.setTarget(id)
    const report = await runInterviewer<InterviewReport>(context, job, 'interview-report', reportPayload(context.repositories(), requireConversationInterview(context.repositories(), id)))
    const latest = requireConversationInterview(context.repositories(), id)
    if (latest.status !== 'reporting') return
    saveConversation(context, { ...latest, status: 'completed', report: normalizeReport(report), completedAt: new Date().toISOString() })
  }, { onFailed: context.notifyDataChanged, onCancelled: context.notifyDataChanged })
}

export function startConversationInterview(context: AppContext, options: ConversationInterviewOptions): string {
  validateConversationOptions(options)
  const repositories = context.repositories()
  if (options.topic && !listTopics(repositories).some((definition) => definition.value === options.topic)) throw new Error(`알 수 없는 주제입니다: ${options.topic}`)
  const interview: ConversationInterview = {
    id: newId('i'),
    mode: 'conversation',
    status: 'in-progress',
    topic: options.topic ?? null,
    difficulty: options.difficulty,
    mainQuestionCount: options.mainQuestionCount,
    maxFollowUps: options.maxFollowUps,
    messages: [],
    report: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  }
  saveConversation(context, interview)
  startTurn(context, interview.id)
  return interview.id
}

function requireInProgress(context: AppContext, id: string): ConversationInterview {
  const interview = requireConversationInterview(context.repositories(), id)
  if (interview.status !== 'in-progress') throw new Error('진행 중인 면접이 아닙니다.')
  return interview
}

export function answerConversation(context: AppContext, id: string, answer: string): void {
  const interview = requireInProgress(context, id)
  if (!answer.trim()) throw new Error('답변을 입력하세요.')
  if (context.jobs.isRunningFor('interview-turn', id)) throw new Error('면접관이 답변을 준비하는 중입니다. 잠시 기다려 주세요.')
  const last = interview.messages.at(-1)
  if (last?.role !== 'interviewer' || last.kind === 'closing') throw new Error('답변할 질문이 없습니다.')
  saveConversation(context, { ...interview, messages: [...interview.messages, { role: 'candidate', text: answer.trim(), at: new Date().toISOString() }] })
  startTurn(context, id)
}

/** Only a turn that never came back can be asked for again: the opening question or the reply to the last answer. */
export function retryConversationTurn(context: AppContext, id: string): void {
  const interview = requireInProgress(context, id)
  if (context.jobs.isRunningFor('interview-turn', id)) return
  if (interview.messages.at(-1)?.role === 'interviewer') throw new Error('이미 면접관의 질문이 와 있습니다.')
  startTurn(context, id)
}

/** Ends early: answers so far still get a report, while an interview with no answer is simply abandoned. */
export function finishConversation(context: AppContext, id: string): void {
  const interview = requireInProgress(context, id)
  for (const job of context.jobs.list()) {
    if (job.kind === 'interview-turn' && job.status === 'running' && job.targetId === id) context.jobs.cancel(job.id)
  }
  const hasAnswer = interview.messages.some((message) => message.role === 'candidate')
  if (!hasAnswer) {
    saveConversation(context, { ...interview, status: 'abandoned', completedAt: new Date().toISOString() })
    return
  }
  saveConversation(context, { ...interview, messages: [...interview.messages, closingMessage()], status: 'reporting' })
  startReport(context, id)
}

export function retryInterviewReport(context: AppContext, id: string): void {
  const interview = requireConversationInterview(context.repositories(), id)
  if (interview.status !== 'reporting') throw new Error('평가를 기다리는 면접이 아닙니다.')
  startReport(context, id)
}

export function abandonConversationInterview(context: AppContext, interview: ConversationInterview): void {
  if (interview.status === 'completed' || interview.status === 'abandoned') throw new Error('이미 끝난 면접입니다.')
  for (const job of context.jobs.list()) {
    const isOwnJob = (job.kind === 'interview-turn' || job.kind === 'interview-report') && job.targetId === interview.id
    if (isOwnJob && job.status === 'running') context.jobs.cancel(job.id)
  }
  context.repositories().saveInterview({ ...interview, status: 'abandoned', completedAt: new Date().toISOString() })
}
