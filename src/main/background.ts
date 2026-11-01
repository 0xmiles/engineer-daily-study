import { app, Menu, nativeImage, Tray } from 'electron'
import type { Settings } from '@shared/types'
import { trayIconPath } from './llm/resources'

// Marks a Windows run started by the login item; macOS reports it through getLoginItemSettings instead.
const HIDDEN_ARG = '--hidden'
const TRAY_ICON_SIZE = 16
const isWindows = process.platform === 'win32'

/** A run the OS started at login waits in the background for the reminder instead of opening a window. */
export function wasStartedAtLogin(): boolean {
  if (process.argv.includes(HIDDEN_ARG)) return true
  return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin
}

/** Only packaged builds register: in development the login item would launch the bare Electron binary. */
export function applyLaunchAtLogin(openAtLogin: boolean): void {
  if (!app.isPackaged) return
  // Windows matches the existing entry by its arguments, so turning it off must pass the same ones.
  app.setLoginItemSettings({ openAtLogin, args: [HIDDEN_ARG] })
}

/** macOS keeps apps alive in the Dock; on Windows only the reminder is a reason to outlive the last window. */
export function keepsRunningWithoutWindow(settings: Settings): boolean {
  return process.platform === 'darwin' || (isWindows && settings.reminderEnabled)
}

interface TrayActions {
  openWindow: () => void
  openToday: () => void
}

/** Windows has no Dock, so while Folio runs without a window the tray is the way to reopen or quit it. */
export class BackgroundTray {
  private tray: Tray | null = null

  constructor(private readonly actions: TrayActions) {}

  update(settings: Settings): void {
    const isNeeded = isWindows && keepsRunningWithoutWindow(settings)
    if (isNeeded && !this.tray) this.tray = this.create()
    if (!isNeeded && this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }

  private create(): Tray {
    const icon = nativeImage.createFromPath(trayIconPath()).resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE, quality: 'best' })
    const tray = new Tray(icon)
    tray.setToolTip('Folio')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Folio 열기', click: this.actions.openWindow },
      { label: '오늘의 문제', click: this.actions.openToday },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() },
    ]))
    tray.on('click', this.actions.openWindow)
    return tray
  }
}
