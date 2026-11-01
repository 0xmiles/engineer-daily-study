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
export type BuiltInTopic =
  | 'kotlin-spring'
  | 'kafka'
  | 'mysql-postgresql'
  | 'dynamodb'
  | 'distributed-systems'
  | 'cache'
  | 'api-architecture'
/** A built-in topic, or a custom topic the user added (`custom-...`). */
export type Topic = string
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

export interface CustomTopic {
  value: Topic
  label: string
  /** What questions on this topic should cover; the question author reads it in place of the taxonomy table. */
  description: string
  createdAt: string
}

/** Stored in the data folder as topics.json, so custom topics travel with the questions that use them. */
export interface TopicConfig {
  disabled: Topic[]
  custom: CustomTopic[]
}

export interface TopicDefinition {
  value: Topic
  label: string
  /** Empty for built-in topics, whose scope lives in the question author skill. */
  description: string
  builtIn: boolean
  /** Automatic selection (the daily set, "any topic" requests) only picks enabled topics. */
  enabled: boolean
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
  /** Points taken off for hints, already subtracted from totalScore; absent in gradings saved before hints existed. */
  hintPenalty?: number
}

export type AttemptOrigin = 'daily' | 'practice' | 'interview'
export type AttemptStatus = 'draft' | 'grading' | 'graded' | 'grading-failed' | 'postponed'

export interface Hint {
  /** 1 points a direction, 2 names the missing concept, 3 gives a concrete clue. */
  level: number
  text: string
  createdAt: string
}

export type FollowUpVerdict = 'good' | 'partial' | 'insufficient'

export interface FollowUpEvaluation {
  verdict: FollowUpVerdict
  comment: string
  modelAnswer: string
}

/** A question the grader asks after grading, probing what the answer left weak. */
export interface FollowUp {
  id: string
  question: string
  /** The weakness or concept this question probes. */
  focus: string
  createdAt: string
  answer: string | null
  answeredAt: string | null
  evaluation: FollowUpEvaluation | null
  /** Set when evaluating the answer failed; cleared by a retry. */
  evaluationError?: string | null
}

/** A question the user asks the grader about the grading or the model answer. */
export interface Inquiry {
  id: string
  question: string
  askedAt: string
  answer: string | null
  answeredAt: string | null
  /** Set when answering failed; cleared by a retry. */
  error?: string | null
}

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
  /** Hints received while writing; each one lowers the total score. Absent in attempts saved before hints existed. */
  hints?: Hint[]
  /** Set when the user put the question off after using every hint; it comes back in the daily set on retryOn. */
  postponedAt?: string | null
  retryOn?: string | null
  /** The attempt that solved the postponed question again, so it is not served a second time. */
  retryAttemptId?: string | null
  /** The mock interview this attempt belongs to. */
  interviewId?: string | null
  followUps?: FollowUp[]
  inquiries?: Inquiry[]
}

export type DailyItemKind = 'scenario' | 'concept' | 'weakness' | 'retry'

export interface DailyItem {
  kind: DailyItemKind
  questionId: string | null
  spec: QuestionSpec
  variantOfAttemptId: string | null
  /** Postponed attempt whose question this item serves again; absent in sets saved before postponing existed. */
  retryOfAttemptId?: string | null
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
export type ThemePreference = 'light' | 'dark' | 'system'

export interface Settings {
  runner: RunnerKind
  difficulty: Difficulty
  dailyCount: 2 | 3
  dataDirectory: string
  claudePath: string
  codexPath: string
  model: string
  theme: ThemePreference
  reminderEnabled: boolean
  /** Local time of the daily reminder as HH:MM. */
  reminderTime: string
  launchAtLogin: boolean
}

export type JobKind =
  | 'generate-question'
  | 'practice-question'
  | 'grade-answer'
  | 'draft-rubric'
  | 'prepare-daily'
  | 'test-runner'
  | 'hint'
  | 'follow-up-questions'
  | 'follow-up-evaluation'
  | 'inquiry'
  | 'prepare-interview'
  | 'interview-turn'
  | 'interview-report'
  | 'study-guide'
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

/** The user's own part of a study note; keywords and reasons are gathered from grading results each time. */
export interface StudyNoteState {
  key: string
  memo: string
  doneAt: string | null
  updatedAt: string
  /** Absent until the tutor writes one; regenerating replaces it. */
  guide?: StudyGuide
}

export interface StudyGuideSection {
  heading: string
  /** Markdown. */
  body: string
}

export interface SelfCheckItem {
  question: string
  /** Markdown. */
  answer: string
}

/** Study material the tutor writes for one study note keyword. */
export interface StudyGuide {
  summary: string
  sections: StudyGuideSection[]
  pitfalls: string[]
  selfCheck: SelfCheckItem[]
  relatedKeywords: string[]
  generatedAt: string
  runner: RunnerKind
}

export type InterviewMode = 'timed' | 'conversation'

interface InterviewBase {
  id: string
  /** Null lets the interview pick among the enabled topics. */
  topic: Topic | null
  difficulty: Difficulty
  createdAt: string
  completedAt: string | null
}

export type TimedInterviewStatus = 'preparing' | 'preparation-failed' | 'in-progress' | 'submitted' | 'abandoned'
export type TimedInterviewFormat = QuestionFormat | 'mixed'

export interface TimedInterviewItem {
  /** Null until preparation generates a question for spec. */
  questionId: string | null
  spec: QuestionSpec
  attemptId: string | null
  /** The item's timer runs from here. */
  startedAt: string | null
  submittedAt: string | null
  timedOut: boolean
}

/** Several written questions in a row, each with a time limit; results are shown only after the last one. */
export interface TimedInterview extends InterviewBase {
  mode: 'timed'
  status: TimedInterviewStatus
  format: TimedInterviewFormat
  timeLimitMinutes: number
  items: TimedInterviewItem[]
  preparationError: string | null
  preparationErrorDetail?: string | null
}

export type ConversationInterviewStatus = 'in-progress' | 'reporting' | 'completed' | 'abandoned'
export type InterviewMessageKind = 'main' | 'follow-up' | 'closing'

export interface InterviewMessage {
  role: 'interviewer' | 'candidate'
  text: string
  at: string
  /** Interviewer messages only. */
  kind?: InterviewMessageKind
  /** Candidate messages only: the interviewer's private note on this answer, shown in the final report. */
  assessment?: string
}

export interface InterviewReport {
  overallScore: number
  summary: string
  questions: { question: string; assessment: string; score: number }[]
  strengths: string[]
  weaknesses: string[]
  studyRecommendations: { keyword: string; reason: string; searchQuery: string }[]
}

/** A spoken-style interview: the interviewer asks, the user answers briefly, and follow-ups depend on the answers. */
export interface ConversationInterview extends InterviewBase {
  mode: 'conversation'
  status: ConversationInterviewStatus
  mainQuestionCount: number
  maxFollowUps: number
  messages: InterviewMessage[]
  report: InterviewReport | null
}

export type Interview = TimedInterview | ConversationInterview
