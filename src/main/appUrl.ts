import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'

const RENDERER_FILE = join(__dirname, '../renderer/index.html')

// A packaged app never trusts the dev server variable, so the environment cannot point the window at another site.
function devServerUrl(): string | null {
  return app.isPackaged ? null : (process.env.ELECTRON_RENDERER_URL ?? null)
}

// Windows paths are case-insensitive and Chromium upper-cases the drive letter in file URLs.
function isSameFile(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

/** The dev server in `npm run dev`, the bundled index.html otherwise. */
export function loadAppPage(load: { url: (url: string) => Promise<void>; file: (path: string) => Promise<void> }): Promise<void> {
  const devServer = devServerUrl()
  return devServer ? load.url(devServer) : load.file(RENDERER_FILE)
}

/** True only for the app's own page, so navigation and IPC from any other page can be refused. */
export function isAppUrl(url: string): boolean {
  try {
    const target = new URL(url)
    const devServer = devServerUrl()
    if (devServer) return target.origin === new URL(devServer).origin
    return target.protocol === 'file:' && isSameFile(fileURLToPath(target), RENDERER_FILE)
  } catch {
    return false
  }
}
