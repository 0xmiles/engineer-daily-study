import { join } from 'node:path'
import { app, BrowserWindow, dialog, powerMonitor, shell } from 'electron'
import { IPC_EVENTS } from '@shared/api'
import type { Settings } from '@shared/types'
import { isAppUrl, loadAppPage } from './appUrl'
import { JobManager, errorMessageOf } from './jobs/jobManager'
import { seedQuestionsDirectory } from './llm/resources'
import { registerIpcHandlers } from './ipc'
import type { AppContext } from './services/appContext'
import { prepareDaily } from './services/daily'
import { recoverInterruptedGradings } from './services/grading'
import { importSeedQuestions } from './services/seedImport'
import { Repositories } from './store/repositories'
import { SettingsStore, defaultSettings } from './store/settingsStore'

const MIDNIGHT_GRACE_MILLISECONDS = 5_000
// Errors that mean the folder itself is unreachable (removed drive, lost permission), not that its contents are broken.
const UNREACHABLE_FOLDER_CODES = new Set(['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'EROFS'])

function broadcast(channel: string, payload?: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

function openRepositories(dataDirectory: string): Repositories {
  const repositories = new Repositories(dataDirectory)
  importSeedQuestions(repositories, dataDirectory, seedQuestionsDirectory())
  recoverInterruptedGradings(repositories)
  return repositories
}

function isUnreachableFolder(error: unknown): boolean {
  return UNREACHABLE_FOLDER_CODES.has((error as NodeJS.ErrnoException).code ?? '')
}

/** An unreachable saved folder falls back to the default one for this run only; the saved choice is retried next launch. */
function openStartupRepositories(settingsStore: SettingsStore): { repositories: Repositories; startupWarning: string | null } {
  const savedDirectory = settingsStore.get().dataDirectory
  try {
    return { repositories: openRepositories(savedDirectory), startupWarning: null }
  } catch (error) {
    if (!isUnreachableFolder(error)) throw error
    const { dataDirectory } = settingsStore.overrideForThisRun({ dataDirectory: settingsStore.getDefaults().dataDirectory })
    const startupWarning = `저장된 데이터 폴더를 열 수 없어 이번 실행에서는 기본 폴더를 사용합니다. 다음 실행 때 저장된 폴더를 다시 시도합니다.\n\n열지 못한 폴더: ${savedDirectory}\n기본 폴더: ${dataDirectory}\n\n${errorMessageOf(error)}`
    return { repositories: openRepositories(dataDirectory), startupWarning }
  }
}

interface AppSetup {
  context: AppContext
  updateSettings: (changes: Partial<Settings>) => Settings
  startupWarning: string | null
}

function createAppContext(settingsStore: SettingsStore): AppSetup {
  let { repositories, startupWarning } = openStartupRepositories(settingsStore)
  const context: AppContext = {
    settings: () => settingsStore.get(),
    repositories: () => repositories,
    jobs: new JobManager((jobs) => broadcast(IPC_EVENTS.jobsChanged, jobs)),
    notifyDataChanged: () => broadcast(IPC_EVENTS.dataChanged),
  }
  // The new folder is opened before it is saved, so a folder that fails to open never reaches the settings file.
  // Running jobs hold the old folder's data, so switching mid-job would split their results across two folders.
  const updateSettings = (changes: Partial<Settings>): Settings => {
    const isDirectoryChange = changes.dataDirectory !== undefined && changes.dataDirectory !== settingsStore.get().dataDirectory
    if (isDirectoryChange && context.jobs.hasRunningJobs()) throw new Error('진행 중인 작업이 끝난 뒤에 데이터 폴더를 바꾸세요.')
    const nextRepositories = isDirectoryChange ? openRepositories(changes.dataDirectory!) : repositories
    const updated = settingsStore.update(changes)
    repositories = nextRepositories
    context.notifyDataChanged()
    return updated
  }
  return { context, updateSettings, startupWarning }
}

/** Links open in the system browser; the window itself never leaves the app page, because preload runs on any page. */
function keepWindowOnAppPage(window: BrowserWindow): void {
  const openExternally = (url: string): void => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  }
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    openExternally(url)
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Daily Study',
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true },
  })
  window.once('ready-to-show', () => window.show())
  keepWindowOnAppPage(window)
  void loadAppPage({ url: (url) => window.loadURL(url), file: (path) => window.loadFile(path) })
  return window
}

function millisecondsUntilNextMidnight(): number {
  const now = new Date()
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return nextMidnight.getTime() - now.getTime() + MIDNIGHT_GRACE_MILLISECONDS
}

/** Keeps the daily set current while the app stays open across midnight or sleeps through it. */
function keepDailySetCurrent(context: AppContext): void {
  const refreshDailySet = (): void => {
    prepareDaily(context)
    context.notifyDataChanged()
  }
  // Rescheduling first keeps the midnight timer alive even if a refresh throws.
  const scheduleNextMidnight = (): void => {
    setTimeout(() => {
      scheduleNextMidnight()
      refreshDailySet()
    }, millisecondsUntilNextMidnight())
  }
  scheduleNextMidnight()
  powerMonitor.on('resume', refreshDailySet)
}

/** Running CLIs would keep spending tokens after the window is gone. */
function cancelRunningJobs(context: AppContext): void {
  for (const job of context.jobs.list()) if (job.status === 'running') context.jobs.cancel(job.id)
}

function showStartupWarning(window: BrowserWindow, message: string): void {
  window.once('ready-to-show', () => void dialog.showMessageBox(window, { type: 'warning', message: '데이터 폴더를 바꿨습니다', detail: message }))
}

app.whenReady().then(() => {
  const settingsStore = new SettingsStore(join(app.getPath('userData'), 'settings.json'), defaultSettings(app.getPath('documents')))
  const { context, updateSettings, startupWarning } = createAppContext(settingsStore)
  registerIpcHandlers(context, updateSettings)
  const window = createWindow()
  if (startupWarning) showStartupWarning(window, startupWarning)
  prepareDaily(context)
  keepDailySetCurrent(context)
  app.on('before-quit', () => cancelRunningJobs(context))
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
