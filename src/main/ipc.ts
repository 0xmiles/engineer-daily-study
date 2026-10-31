import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { HistoryEntry, InvokableApi } from '@shared/api'
import type { Settings } from '@shared/types'
import type { Repositories } from './store/repositories'
import { validateSettingsChanges } from './store/settingsStore'
import { isAppUrl } from './appUrl'
import { computeStats } from './domain/stats'
import { locateRunner } from './llm/cliLocator'
import { runSkill } from './llm/skillRunner'
import type { AppContext } from './services/appContext'
import { getTodayView, prepareDaily, retryDailyItem, startDailyAttempt } from './services/daily'
import { addAuthoringFeedback, addQuestionFeedback, setFeedbackActive } from './services/feedback'
import { retryGrading, submitAttempt } from './services/grading'
import { createManualQuestion, deleteQuestion, generateQuestions, requestPractice, saveDraft, setReviewStatus, startAttempt } from './services/questionBank'

type Handlers = { [Method in keyof InvokableApi]: (...args: Parameters<InvokableApi[Method]>) => Awaited<ReturnType<InvokableApi[Method]>> | ReturnType<InvokableApi[Method]> }

const RUNNER_TEST_PAYLOAD = { mode: 'duplicate-check', candidate: { title: '연결 테스트' }, similarQuestions: [] }

function testRunner(context: AppContext): string {
  return context.jobs.start('test-runner', '실행기 연결 테스트', async (job) => {
    await runSkill({ skill: 'daily-study-question-author', schema: 'duplicate-check', payload: RUNNER_TEST_PAYLOAD, settings: context.settings(), signal: job.signal, onStage: job.setStage })
  })
}

/** Submitted attempts plus drafts that already have text, newest first. */
function listHistory(repositories: Repositories): HistoryEntry[] {
  const questions = new Map(repositories.questions.readAll().map((question) => [question.id, question]))
  return repositories.attempts.readAll()
    .filter((attempt) => attempt.status !== 'draft' || attempt.answer.trim())
    .sort((left, right) => (right.submittedAt ?? right.createdAt).localeCompare(left.submittedAt ?? left.createdAt))
    .map((attempt) => ({ attempt, question: questions.get(attempt.questionId) ?? null }))
}

async function chooseDataDirectory(event: IpcMainInvokeEvent): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(event.sender)
  const options: Electron.OpenDialogOptions = { title: '데이터 폴더 선택', properties: ['openDirectory', 'createDirectory'] }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/** An out-of-range index would leave holes in the stored set that later read back as null items. */
function requireDailyItemIndex(repositories: Repositories, date: string, itemIndex: number): number {
  const itemCount = repositories.dailySets.read(date)?.items.length ?? 0
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= itemCount) throw new Error('오늘의 문제 항목을 찾을 수 없습니다.')
  return itemIndex
}

const newestCreatedFirst = (left: { createdAt: string }, right: { createdAt: string }): number => right.createdAt.localeCompare(left.createdAt)

/** Only the app's own page may call the API, even if some other page ends up loaded in the window. */
function requireAppSender(event: IpcMainInvokeEvent): void {
  if (!event.senderFrame || !isAppUrl(event.senderFrame.url)) throw new Error('허용되지 않은 화면에서 온 요청입니다.')
}

function registerGuardedHandler(method: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
  ipcMain.handle(`api:${method}`, (event, ...args: unknown[]) => {
    requireAppSender(event)
    return handler(event, ...args)
  })
}

export function registerIpcHandlers(context: AppContext, updateSettings: (changes: Partial<Settings>) => Settings): void {
  const repositories = () => context.repositories()
  const handlers: Omit<Handlers, 'chooseDataDirectory'> = {
    getSettings: () => context.settings(),
    saveSettings: (changes) => updateSettings(validateSettingsChanges(changes)),
    locateRunners: async () => ({
      claude: await locateRunner('claude', context.settings().claudePath),
      codex: await locateRunner('codex', context.settings().codexPath),
    }),
    testRunner: () => testRunner(context),
    getToday: () => getTodayView(context),
    prepareToday: () => prepareDaily(context),
    startDailyAttempt: (date, itemIndex) => startDailyAttempt(context, date, requireDailyItemIndex(repositories(), date, itemIndex)),
    retryDailyItem: (date, itemIndex) => retryDailyItem(context, date, requireDailyItemIndex(repositories(), date, itemIndex)),
    requestPractice: (spec) => requestPractice(context, spec),
    listQuestions: () => repositories().questions.readAll().sort(newestCreatedFirst),
    getQuestion: (id) => repositories().questions.read(id),
    createManualQuestion: (input) => createManualQuestion(context, input),
    generateQuestions: (spec, count) => generateQuestions(context, spec, count),
    setReviewStatus: (id, status) => setReviewStatus(context, id, status),
    deleteQuestion: (id) => deleteQuestion(context, id),
    startAttempt: (questionId, origin) => startAttempt(context, questionId, origin),
    getAttempt: (id) => repositories().attempts.read(id),
    saveDraft: (id, answer) => saveDraft(context, id, answer),
    submitAttempt: (id, answer) => submitAttempt(context, id, answer),
    retryGrading: (id) => retryGrading(context, id),
    listHistory: () => listHistory(repositories()),
    getStats: () => computeStats(repositories().attempts.readAll(), repositories().questions.readAll()),
    listFeedback: () => repositories().feedback.readAll().sort(newestCreatedFirst),
    addQuestionFeedback: (input) => addQuestionFeedback(context, input),
    addAuthoringFeedback: (input) => addAuthoringFeedback(context, input),
    setFeedbackActive: (id, active) => setFeedbackActive(context, id, active),
    listJobs: () => context.jobs.list(),
    cancelJob: (id) => context.jobs.cancel(id),
  }
  for (const [method, handler] of Object.entries(handlers)) {
    registerGuardedHandler(method, (_event, ...args) => (handler as (...values: unknown[]) => unknown)(...args))
  }
  // The folder picker needs the calling window, so it is registered with the event instead of through `handlers`.
  registerGuardedHandler('chooseDataDirectory', (event) => chooseDataDirectory(event))
}
