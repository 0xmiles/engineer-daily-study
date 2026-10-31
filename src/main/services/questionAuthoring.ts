import type { Question, QuestionContent, QuestionSource, QuestionSpec } from '@shared/types'
import type { ManualQuestionInput } from '@shared/api'
import { perspectivesOf } from '@shared/taxonomy'
import { findSimilarQuestions, hasSameTitle } from '../domain/similarity'
import { selectAuthoringGuidelines } from '../domain/feedbackSelection'
import { completeGenerationSpec } from '../domain/selection'
import { runSkill } from '../llm/skillRunner'
import { SerialQueue, type JobContext } from '../jobs/jobManager'
import { newId } from '../store/repositories'
import { buildSelectionContext, type AppContext } from './appContext'

const MAX_GENERATION_ROUNDS = 3
const MAX_EXISTING_SUMMARIES = 80

export type ConcreteSpec = Required<QuestionSpec>

export interface VariantSource {
  baseQuestion: Question
  weakPoints: string[]
}

export interface GenerationRequest {
  /** Missing topic or category is filled when this request's turn comes, from the bank as it is then. */
  spec: QuestionSpec
  variant?: VariantSource | null
  onSpecResolved?: (spec: ConcreteSpec) => void
}

// One generation at a time, so each one picks its topic and checks duplicates against the questions saved before it.
const generationQueue = new SerialQueue()

interface DuplicateCheck {
  isDuplicate: boolean
  duplicateOfId: string
  reason: string
}

function existingSummaries(questions: Question[], spec: ConcreteSpec): object[] {
  return questions
    .filter((question) => question.topic === spec.topic || question.category === spec.category)
    .slice(0, MAX_EXISTING_SUMMARIES)
    .map((question) => ({ id: question.id, title: question.title, keyIssues: question.keyIssues }))
}

function runQuestionAuthor<T>(context: AppContext, job: JobContext, schema: 'question-content' | 'duplicate-check', payload: object): Promise<T> {
  return runSkill<T>({ skill: 'daily-study-question-author', schema, payload, settings: context.settings(), signal: job.signal, onStage: job.setStage })
}

/** The requested classification wins over whatever the model echoed back; perspectives always come from taxonomy. */
function normalizeContent(content: QuestionContent, spec: ConcreteSpec, keepModelTopic: boolean): QuestionContent {
  const topic = keepModelTopic ? content.topic : spec.topic
  return { ...content, format: spec.format, category: spec.category, difficulty: spec.difficulty, topic, perspectives: perspectivesOf(spec.category) }
}

async function findDuplicateId(context: AppContext, job: JobContext, candidate: QuestionContent, questions: Question[]): Promise<string | null> {
  if (hasSameTitle(candidate, questions)) return questions.find((question) => question.title === candidate.title)?.id ?? 'same-title'
  const similarQuestions = findSimilarQuestions(candidate, questions)
  if (similarQuestions.length === 0) return null
  job.setStage('기존 문제와 중복인지 확인하는 중')
  const verdict = await runQuestionAuthor<DuplicateCheck>(context, job, 'duplicate-check', {
    mode: 'duplicate-check',
    candidate,
    similarQuestions: similarQuestions.map(({ id, title, situation, requirements, keyIssues }) => ({ id, title, situation, requirements, keyIssues })),
  })
  return verdict.isDuplicate ? verdict.duplicateOfId || similarQuestions[0].id : null
}

function toQuestion(content: QuestionContent, source: QuestionSource, variantOf: string | null): Question {
  return { ...content, id: newId('q'), source, reviewStatus: 'unreviewed', createdAt: new Date().toISOString(), variantOf }
}

/** Generates a new (or variant) question that passes the duplicate check, then stores it unserved. */
export async function generateQuestion(context: AppContext, job: JobContext, request: GenerationRequest): Promise<Question> {
  job.setStage('앞선 문제 생성이 끝나기를 기다리는 중')
  return generationQueue.run(job.signal, () => {
    const spec = completeGenerationSpec(buildSelectionContext(context.repositories()), request.spec) as ConcreteSpec
    request.onSpecResolved?.(spec)
    return authorUniqueQuestion(context, job, spec, request.variant ?? null)
  })
}

async function authorUniqueQuestion(context: AppContext, job: JobContext, spec: ConcreteSpec, variant: VariantSource | null): Promise<Question> {
  const repositories = context.repositories()
  const questions = repositories.questions.readAll()
  const rejectedTitles: string[] = []
  for (let round = 1; round <= MAX_GENERATION_ROUNDS; round++) {
    const payload = {
      mode: variant ? 'variant' : 'generate',
      ...spec,
      baseQuestion: variant?.baseQuestion ?? null,
      weakPoints: variant?.weakPoints ?? [],
      existingQuestions: existingSummaries(questions, spec),
      rejectedAsDuplicate: rejectedTitles,
      userFeedback: selectAuthoringGuidelines(repositories.feedback.readAll(), questions, spec),
    }
    job.setStage(round === 1 ? '문제를 만드는 중' : `중복을 피해 다시 만드는 중 (${round}/${MAX_GENERATION_ROUNDS})`)
    const content = normalizeContent(await runQuestionAuthor<QuestionContent>(context, job, 'question-content', payload), spec, variant !== null)
    if (!(await findDuplicateId(context, job, content, questions))) {
      const question = toQuestion(content, variant ? 'variant' : 'generated', variant?.baseQuestion.id ?? null)
      repositories.saveQuestion(question)
      return question
    }
    rejectedTitles.push(content.title)
  }
  throw new Error('기존 문제와 겹치지 않는 문제를 만들지 못했습니다. 조건을 바꿔 다시 시도하세요.')
}

/** Keeps the user's own title, situation and requirements verbatim and lets the skill fill the rubric. */
export async function draftRubricForManualQuestion(context: AppContext, job: JobContext, input: ManualQuestionInput): Promise<Question> {
  job.setStage('채점 기준을 작성하는 중')
  const drafted = await runQuestionAuthor<QuestionContent>(context, job, 'question-content', { mode: 'draft-rubric', ...input.spec, title: input.title, situation: input.situation, requirements: input.requirements })
  const content: QuestionContent = {
    ...normalizeContent(drafted, input.spec, false),
    title: input.title,
    situation: input.situation,
    requirements: input.requirements,
    recommendedLength: input.recommendedLength,
  }
  const question = toQuestion(content, 'manual', null)
  context.repositories().saveQuestion(question)
  return question
}
