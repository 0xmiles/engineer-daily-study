import type {
  Attempt,
  AttemptOrigin,
  DailyItem,
  Feedback,
  FeedbackScope,
  Job,
  Question,
  QuestionFeedbackReason,
  QuestionRating,
  QuestionSpec,
  ReviewStatus,
  Settings,
} from './types'

export interface TodayItemView extends DailyItem {
  question: Question | null
  attempt: Attempt | null
}

export interface TodayView {
  date: string
  items: TodayItemView[]
  isPreparing: boolean
}

export interface HistoryEntry {
  attempt: Attempt
  question: Question | null
}

export interface ScoreBucket {
  key: string
  count: number
  averageScore: number
}

export interface StudyStats {
  gradedCount: number
  averageScore: number | null
  byTopic: ScoreBucket[]
  byCategory: ScoreBucket[]
  /** Perspective averages scaled to 0~100. */
  byPerspective: ScoreBucket[]
}

export interface ManualQuestionInput {
  spec: Required<QuestionSpec>
  title: string
  situation: string
  requirements: string[]
  recommendedLength: { min: number; max: number }
}

export interface QuestionFeedbackInput {
  questionId: string
  rating: QuestionRating
  reasons: QuestionFeedbackReason[]
  comment: string
}

export interface AuthoringFeedbackInput {
  comment: string
  scope: FeedbackScope
}

/** Either the work finished immediately or a background job will produce the target. */
export type StartResult = { kind: 'ready'; targetId: string } | { kind: 'job'; jobId: string }

export interface RunnerStatus {
  claude: string | null
  codex: string | null
}

export interface DailyStudyApi {
  getSettings(): Promise<Settings>
  saveSettings(changes: Partial<Settings>): Promise<Settings>
  locateRunners(): Promise<RunnerStatus>
  testRunner(): Promise<string>
  /** Opens a folder picker; null when the user cancels. */
  chooseDataDirectory(): Promise<string | null>

  getToday(): Promise<TodayView>
  prepareToday(): Promise<void>
  startDailyAttempt(date: string, itemIndex: number): Promise<string>
  retryDailyItem(date: string, itemIndex: number): Promise<void>
  requestPractice(spec: QuestionSpec): Promise<StartResult>

  listQuestions(): Promise<Question[]>
  getQuestion(id: string): Promise<Question | null>
  createManualQuestion(input: ManualQuestionInput): Promise<string>
  generateQuestions(spec: QuestionSpec, count: number): Promise<string[]>
  setReviewStatus(id: string, status: ReviewStatus): Promise<void>
  deleteQuestion(id: string): Promise<void>

  startAttempt(questionId: string, origin: AttemptOrigin): Promise<string>
  getAttempt(id: string): Promise<Attempt | null>
  saveDraft(id: string, answer: string): Promise<Attempt>
  submitAttempt(id: string, answer: string): Promise<string>
  retryGrading(id: string): Promise<string>
  listHistory(): Promise<HistoryEntry[]>
  getStats(): Promise<StudyStats>

  listFeedback(): Promise<Feedback[]>
  addQuestionFeedback(input: QuestionFeedbackInput): Promise<void>
  addAuthoringFeedback(input: AuthoringFeedbackInput): Promise<void>
  setFeedbackActive(id: string, active: boolean): Promise<void>

  listJobs(): Promise<Job[]>
  cancelJob(id: string): Promise<void>
  onJobsChanged(listener: (jobs: Job[]) => void): () => void
  onDataChanged(listener: () => void): () => void
}

export type InvokableApi = Omit<DailyStudyApi, 'onJobsChanged' | 'onDataChanged'>

export const IPC_EVENTS = {
  jobsChanged: 'event:jobs-changed',
  dataChanged: 'event:data-changed',
} as const
