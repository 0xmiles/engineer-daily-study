import { app, Notification } from 'electron'
import { localDateKey } from './domain/dates'
import { isReminderTimePassed, millisecondsUntilReminder, reminderBody } from './domain/reminder'
import type { AppContext } from './services/appContext'
import { getTodayView } from './services/daily'
import { getStreak } from './services/streak'

// Must match `build.appId` in package.json: Windows shows notifications only for the id of the installed Start Menu shortcut.
const APP_USER_MODEL_ID = 'dev.dailystudy.app'
const REMINDER_TITLE = '오늘의 문제를 풀 시간입니다'

/** Windows needs this before any notification; development has no shortcut, so it uses the Electron binary's path. */
export function registerNotificationIdentity(): void {
  if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? APP_USER_MODEL_ID : process.execPath)
}

/** A postponed question was put off on purpose, so only unopened and unfinished drafts count as left. */
function pendingDailyCount(context: AppContext): number {
  return getTodayView(context).items.filter((item) => !item.attempt || item.attempt.status === 'draft').length
}

/** One notification a day at the reminder time, only while some of today's questions are still unsolved. */
export class DailyReminder {
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastRemindedOn: string | null = null
  // Electron drops a notification's click handler once the object is garbage-collected.
  private notification: Notification | null = null

  constructor(private readonly context: AppContext, private readonly openToday: () => void) {}

  /**
   * With catchUp, a reminder time that already passed today (asleep, or started at login later) is reminded now.
   * Rescheduling first keeps the timer alive even if a reminder throws.
   */
  reschedule({ catchUp = false }: { catchUp?: boolean } = {}): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const { reminderEnabled, reminderTime } = this.context.settings()
    if (!reminderEnabled) return
    const now = new Date()
    this.timer = setTimeout(() => {
      this.reschedule()
      this.remind()
    }, millisecondsUntilReminder(reminderTime, now))
    if (catchUp && isReminderTimePassed(reminderTime, now)) this.remind()
  }

  // A timer firing a moment early, or a catch-up right after the timer, must not notify twice in one day.
  private remind(): void {
    const today = localDateKey(new Date())
    if (this.lastRemindedOn === today || !Notification.isSupported()) return
    try {
      const body = reminderBody(pendingDailyCount(this.context), getStreak(this.context.repositories()))
      if (!body) return
      this.lastRemindedOn = today
      this.notification = new Notification({ title: REMINDER_TITLE, body })
      this.notification.on('click', this.openToday)
      this.notification.show()
    } catch (error) {
      console.warn('Could not show the daily reminder:', error)
    }
  }
}
