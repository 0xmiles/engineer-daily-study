export type QuestionFormat = 'scenario' | 'concept'
export type ScenarioCategory =
  | 'incident-diagnosis'
  | 'design-tradeoff'
  | 'consistency-concurrency'
  | 'performance-scaling'
  | 'migration-legacy'
  | 'code-review'
  | 'observability-operations'
export type ConceptCategory = 'principle' | 'why' | 'comparison' | 'cross-layer' | 'architecture-principle'
export type QuestionCategory = ScenarioCategory | ConceptCategory
export type Topic =
  | 'kotlin-spring'
  | 'kafka'
  | 'mysql-postgresql'
  | 'dynamodb'
  | 'distributed-systems'
  | 'cache'
  | 'api-architecture'
export type Difficulty = 'junior' | 'middle' | 'senior'

export interface RubricItem {
  point: string
  explanation: string
}

/** Fields the LLM produces; matches schemas/question-content.schema.json. */
export interface QuestionContent {
  format: QuestionFormat
  category: QuestionCategory
  topic: Topic
  difficulty: Difficulty
  title: string
  situation: string
  requirements: string[]
  recommendedLength: { min: number; max: number }
  keyIssues: string[]
  rubric: {
    required: RubricItem[]
    bonus: RubricItem[]
    deductions: RubricItem[]
    commonMistakes: RubricItem[]
  }
  perspectives: string[]
  modelAnswer: string
  relatedStudyTopics: string[]
}

export type QuestionSource = 'seed' | 'generated' | 'variant' | 'manual'
export type ReviewStatus = 'reviewed' | 'unreviewed'

export interface Question extends QuestionContent {
  id: string
  source: QuestionSource
  reviewStatus: ReviewStatus
  createdAt: string
  variantOf: string | null
  servedAt?: string
}

export interface QuestionSpec {
  format: QuestionFormat
  category?: QuestionCategory
  topic?: Topic
  difficulty: Difficulty
}

/** Matches schemas/grading-result.schema.json. */
export interface GradingResult {
  requiredCoverage: { point: string; status: 'full' | 'partial' | 'missing'; comment: string }[]
  bonusMatched: string[]
  deductionsApplied: string[]
  perspectiveScores: { perspective: string; score: number; comment: string }[]
  strengths: { summary: string; quote: string }[]
  weaknesses: { summary: string; quote: string; improvement: string }[]
  studyRecommendations: { keyword: string; reason: string; searchQuery: string }[]
  overallComment: string
}

export interface ScoredGrading extends GradingResult {
  totalScore: number
  gradedAt: string
  runner: RunnerKind
}

export type AttemptOrigin = 'daily' | 'practice'
export type AttemptStatus = 'draft' | 'grading' | 'graded' | 'grading-failed'

export interface Attempt {
  id: string
  questionId: string
  origin: AttemptOrigin
  date: string
  answer: string
  status: AttemptStatus
  createdAt: string
  draftSavedAt: string | null
  submittedAt: string | null
  grading: ScoredGrading | null
  gradingError: string | null
  /** Raw runner output for the failure panel; absent in attempts saved before it was recorded. */
  gradingErrorDetail?: string | null
  weaknessFollowUps: number
}

export type DailyItemKind = 'scenario' | 'concept' | 'weakness'

export interface DailyItem {
  kind: DailyItemKind
  questionId: string | null
  spec: QuestionSpec
  variantOfAttemptId: string | null
  attemptId: string | null
  generationError: string | null
  /** Raw runner output for the failure panel; absent in sets saved before it was recorded. */
  generationErrorDetail?: string | null
}

export interface DailySet {
  date: string
  items: DailyItem[]
}

export type QuestionRating = 'good' | 'poor'
export type QuestionFeedbackReason =
  | 'ambiguous'
  | 'too-easy'
  | 'too-hard'
  | 'unrealistic'
  | 'rubric-error'
  | 'similar-to-existing'

export interface FeedbackScope {
  format?: QuestionFormat
  category?: QuestionCategory
  topic?: Topic
  difficulty?: Difficulty
}

export interface Feedback {
  id: string
  kind: 'question' | 'authoring'
  questionId: string | null
  rating: QuestionRating | null
  reasons: QuestionFeedbackReason[]
  comment: string
  scope: FeedbackScope
  active: boolean
  createdAt: string
}

export type RunnerKind = 'claude' | 'codex'

export interface Settings {
  runner: RunnerKind
  difficulty: Difficulty
  dailyCount: 2 | 3
  dataDirectory: string
  claudePath: string
  codexPath: string
  model: string
}

export type JobKind = 'generate-question' | 'practice-question' | 'grade-answer' | 'draft-rubric' | 'prepare-daily' | 'test-runner'
export type JobStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface Job {
  id: string
  kind: JobKind
  label: string
  stage: string
  status: JobStatus
  startedAt: string
  finishedAt: string | null
  error: string | null
  errorDetail: string | null
  /** Id of the entity the job produced or works on (question id or attempt id). */
  targetId: string | null
}
