import { join } from 'node:path'
import { app, BrowserWindow, dialog, nativeTheme, powerMonitor, shell } from 'electron'
import { IPC_EVENTS, type NavigationTarget } from '@shared/api'
import type { Settings, ThemePreference } from '@shared/types'
import { isAppUrl, loadAppPage } from './appUrl'
import { BackgroundTray, applyLaunchAtLogin, keepsRunningWithoutWindow, wasStartedAtLogin } from './background'
import { JobManager, errorMessageOf } from './jobs/jobManager'
import { seedQuestionsDirectory } from './llm/resources'
import { registerIpcHandlers } from './ipc'
import { DailyReminder, registerNotificationIdentity } from './reminders'
import type { AppContext } from './services/appContext'
import { prepareDaily } from './services/daily'
import { recoverInterruptedDiscussions } from './services/followUps'
import { recoverInterruptedGradings } from './services/grading'
import { recoverInterruptedInterviews } from './services/interviews'
import { importSeedQuestions } from './services/seedImport'
import { Repositories } from './store/repositories'
import { SettingsStore, defaultSettings } from './store/settingsStore'

const MIDNIGHT_GRACE_MILLISECONDS = 5_000
// Errors that mean the folder itself is unreachable (removed drive, lost permission), not that its contents are broken.
const UNREACHABLE_FOLDER_CODES = new Set(['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'EROFS'])
// The app was renamed from Daily Study; keeping its userData folder keeps the saved settings, including the data folder.
const USER_DATA_FOLDER_NAME = 'Daily Study'
// Matches --paper in the renderer theme, so the window never flashes another color before the page paints.
const WINDOW_BACKGROUND = { light: '#F6F4EF', dark: '#161513' }
// A packaged app takes its Dock icon from the bundle; `npm run dev` would otherwise show Electron's.
const DEV_DOCK_ICON = join(__dirname, '../../build/icon.png')

app.setPath('userData', join(app.getPath('appData'), USER_DATA_FOLDER_NAME))

// The lock lives in userData, so it is taken after the path is set. A second launch only brings the running app forward.
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) app.quit()

function broadcast(channel: string, payload?: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

function openRepositories(dataDirectory: string): Repositories {
  const repositories = new Repositories(dataDirectory)
  importSeedQuestions(repositories, dataDirectory, seedQuestionsDirectory())
  recoverInterruptedGradings(repositories)
  recoverInterruptedDiscussions(repositories)
  recoverInterruptedInterviews(repositories)
  return repositories
}

/** The renderer's prefers-color-scheme follows themeSource, so this one switch restyles the page and the native controls. */
function applyTheme(theme: ThemePreference): void {
  nativeTheme.themeSource = theme
}

function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light
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
    if (changes.theme) applyTheme(updated.theme)
    // A theme switch changes no data, so open screens (and a settings form being edited) keep their state.
    if (Object.keys(changes).some((key) => key !== 'theme')) context.notifyDataChanged()
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
    title: 'Folio',
    backgroundColor: windowBackground(),
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true },
  })
  window.once('ready-to-show', () => window.show())
  keepWindowOnAppPage(window)
  void loadAppPage({ url: (url) => window.loadURL(url), file: (path) => window.loadFile(path) })
  return window
}

function showMainWindow(): BrowserWindow {
  const existing = BrowserWindow.getAllWindows()[0]
  if (!existing) return createWindow()
  if (existing.isMinimized()) existing.restore()
  existing.show()
  existing.focus()
  return existing
}

/** A new window already starts on the today screen; an open one is asked to switch to it. */
function openToday(): void {
  const hadWindow = BrowserWindow.getAllWindows().length > 0
  const window = showMainWindow()
  if (hadWindow) window.webContents.send(IPC_EVENTS.navigate, 'today' satisfies NavigationTarget)
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

interface BackgroundServices {
  reminder: DailyReminder
  tray: BackgroundTray
}

/** Applies the settings that live outside the window: the reminder timer, the Windows tray and the login item. */
function withBackgroundSettings(updateSettings: (changes: Partial<Settings>) => Settings, { reminder, tray }: BackgroundServices) {
  return (changes: Partial<Settings>): Settings => {
    const updated = updateSettings(changes)
    if (changes.reminderEnabled !== undefined || changes.reminderTime !== undefined) reminder.reschedule()
    if (changes.reminderEnabled !== undefined) tray.update(updated)
    if (changes.launchAtLogin !== undefined) applyLaunchAtLogin(updated.launchAtLogin)
    return updated
  }
}

/**
 * A login start stays hidden only when the reminder gives it a reason to run in the background;
 * a startup warning needs a window to be read in.
 */
function shouldStartHidden(settings: Settings, startupWarning: string | null): boolean {
  return wasStartedAtLogin() && settings.reminderEnabled && !startupWarning
}

app.whenReady().then(() => {
  if (!isPrimaryInstance) return
  registerNotificationIdentity()
  const settingsStore = new SettingsStore(join(app.getPath('userData'), 'settings.json'), defaultSettings(app.getPath('documents')))
  const { context, updateSettings, startupWarning } = createAppContext(settingsStore)
  const background: BackgroundServices = {
    reminder: new DailyReminder(context, openToday),
    tray: new BackgroundTray({ openWindow: () => { showMainWindow() }, openToday }),
  }
  registerIpcHandlers(context, withBackgroundSettings(updateSettings, background))
  applyTheme(settingsStore.get().theme)
  nativeTheme.on('updated', () => {
    for (const window of BrowserWindow.getAllWindows()) window.setBackgroundColor(windowBackground())
  })
  if (!app.isPackaged) app.dock?.setIcon(DEV_DOCK_ICON)
  applyLaunchAtLogin(settingsStore.get().launchAtLogin)
  background.tray.update(settingsStore.get())
  const startHidden = shouldStartHidden(settingsStore.get(), startupWarning)
  if (!startHidden) {
    const window = createWindow()
    if (startupWarning) showStartupWarning(window, startupWarning)
  }
  prepareDaily(context)
  keepDailySetCurrent(context)
  background.reminder.reschedule({ catchUp: startHidden })
  // Timers do not run while the computer sleeps, so the reminder is rescheduled and a missed one shown on wake.
  powerMonitor.on('resume', () => background.reminder.reschedule({ catchUp: true }))
  app.on('before-quit', () => cancelRunningJobs(context))
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  app.on('second-instance', () => { showMainWindow() })
  // app.quit() (tray, Cmd+Q) closes windows without this event, so quitting from the tray still quits.
  app.on('window-all-closed', () => {
    if (!keepsRunningWithoutWindow(settingsStore.get())) app.quit()
  })
})
