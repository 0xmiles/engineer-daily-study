import type {
  Attempt,
  AttemptOrigin,
  ConversationInterview,
  DailyItem,
  Difficulty,
  Feedback,
  FeedbackScope,
  Job,
  Question,
  QuestionFeedbackReason,
  QuestionRating,
  QuestionSpec,
  ReviewStatus,
  Settings,
  StudyGuide,
  TimedInterview,
  TimedInterviewFormat,
  TimedInterviewItem,
  Topic,
  TopicDefinition,
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

export interface CustomTopicInput {
  label: string
  description: string
}

export interface StudyNoteSource {
  kind: 'attempt' | 'interview'
  /** Attempt id or interview id to open. */
  id: string
  title: string
  reason: string
  searchQuery: string
  recommendedAt: string
}

/** Study recommendations with the same keyword, gathered from every grading and interview report. */
export interface StudyNote {
  key: string
  keyword: string
  /** Newest first. */
  sources: StudyNoteSource[]
  topics: Topic[]
  memo: string
  isDone: boolean
  /** Recommended again after the user marked it done. */
  isReopened: boolean
  lastRecommendedAt: string
  hasGuide: boolean
}

export interface StudyNoteDetail extends StudyNote {
  guide: StudyGuide | null
}

export interface StudyNoteChanges {
  memo?: string
  done?: boolean
}

export interface StudyDay {
  date: string
  count: number
}

export interface StreakView {
  /** Consecutive study days up to today, or up to yesterday while today is still open. */
  current: number
  longest: number
  studiedToday: boolean
  /** Activity per day for the heatmap, oldest first, ending today. */
  days: StudyDay[]
}

export interface TimedInterviewOptions {
  topic?: Topic
  difficulty: Difficulty
  format: TimedInterviewFormat
  questionCount: number
  timeLimitMinutes: number
}

export interface ConversationInterviewOptions {
  topic?: Topic
  difficulty: Difficulty
  mainQuestionCount: number
  maxFollowUps: number
}

export interface TimedInterviewItemView extends TimedInterviewItem {
  question: Question | null
  attempt: Attempt | null
}

export type TimedInterviewView = Omit<TimedInterview, 'items'> & { items: TimedInterviewItemView[] }
export type InterviewView = TimedInterviewView | ConversationInterview

/** Screens the main process can open, e.g. from a notification click. */
export type NavigationTarget = 'today'

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

  listTopics(): Promise<TopicDefinition[]>
  setTopicEnabled(value: Topic, enabled: boolean): Promise<void>
  addCustomTopic(input: CustomTopicInput): Promise<TopicDefinition>
  updateCustomTopic(value: Topic, input: CustomTopicInput): Promise<void>
  deleteCustomTopic(value: Topic): Promise<void>

  /** Saves the draft, then generates the next hint in the background; resolves to the job id. */
  requestHint(attemptId: string, answer: string): Promise<string>
  postponeAttempt(attemptId: string, answer: string): Promise<void>
  /** Postponed attempts that have not been solved again yet. */
  listPostponed(): Promise<HistoryEntry[]>
  /** Resolves to the attempt that solves the postponed question again. */
  startRetry(postponedAttemptId: string): Promise<string>

  requestFollowUps(attemptId: string): Promise<string>
  answerFollowUp(attemptId: string, followUpId: string, answer: string): Promise<string>
  retryFollowUpEvaluation(attemptId: string, followUpId: string): Promise<string>
  askInquiry(attemptId: string, question: string): Promise<string>
  retryInquiry(attemptId: string, inquiryId: string): Promise<string>

  listStudyNotes(): Promise<StudyNote[]>
  /** Finds the note however the keyword is spelled; null when no grading or interview recommended it. */
  getStudyNote(keyword: string): Promise<StudyNoteDetail | null>
  updateStudyNote(key: string, changes: StudyNoteChanges): Promise<void>
  /** Writes the note's study material in the background, replacing any earlier one. Resolves to the job id. */
  generateStudyGuide(key: string): Promise<string>

  getStreak(): Promise<StreakView>

  listInterviews(): Promise<InterviewView[]>
  getInterview(id: string): Promise<InterviewView | null>
  /** Resolves to the new interview id. */
  startTimedInterview(options: TimedInterviewOptions): Promise<string>
  retryInterviewPreparation(id: string): Promise<void>
  /** Starts the timer of the first item not submitted yet. */
  beginTimedItem(id: string): Promise<void>
  submitTimedItem(id: string, answer: string, timedOut: boolean): Promise<void>
  startConversationInterview(options: ConversationInterviewOptions): Promise<string>
  answerConversation(id: string, answer: string): Promise<void>
  retryConversationTurn(id: string): Promise<void>
  finishConversation(id: string): Promise<void>
  retryInterviewReport(id: string): Promise<void>
  abandonInterview(id: string): Promise<void>

  listFeedback(): Promise<Feedback[]>
  addQuestionFeedback(input: QuestionFeedbackInput): Promise<void>
  addAuthoringFeedback(input: AuthoringFeedbackInput): Promise<void>
  setFeedbackActive(id: string, active: boolean): Promise<void>

  listJobs(): Promise<Job[]>
  cancelJob(id: string): Promise<void>
  onJobsChanged(listener: (jobs: Job[]) => void): () => void
  onDataChanged(listener: () => void): () => void
  onNavigate(listener: (target: NavigationTarget) => void): () => void
}

export type InvokableApi = Omit<DailyStudyApi, 'onJobsChanged' | 'onDataChanged' | 'onNavigate'>

export const IPC_EVENTS = {
  jobsChanged: 'event:jobs-changed',
  dataChanged: 'event:data-changed',
  navigate: 'event:navigate',
} as const
