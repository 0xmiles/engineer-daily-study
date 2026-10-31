import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { execFile } from 'node:child_process'
import type { RunnerKind } from '@shared/types'

const isWindows = process.platform === 'win32'
const LOGIN_SHELL_TIMEOUT_MILLISECONDS = 5000
const PATH_MARKER = '__DAILY_STUDY_PATH__'

let cachedSearchPath: Promise<string> | null = null

/**
 * Apps launched from Finder do not inherit the shell PATH, so on macOS the login shell is asked for it once.
 * Windows GUI apps already receive the user PATH.
 */
function loginShellPath(): Promise<string> {
  const inheritedPath = process.env.PATH ?? ''
  if (isWindows) return Promise.resolve(inheritedPath)
  const shell = process.env.SHELL || '/bin/zsh'
  return new Promise((resolve) => {
    execFile(shell, ['-ilc', `printf "${PATH_MARKER}%s${PATH_MARKER}" "$PATH"`], { timeout: LOGIN_SHELL_TIMEOUT_MILLISECONDS }, (error, stdout) => {
      const match = stdout?.match(new RegExp(`${PATH_MARKER}(.*)${PATH_MARKER}`))
      resolve(error || !match ? inheritedPath : `${match[1]}${delimiter}${inheritedPath}`)
    })
  })
}

function wellKnownDirectories(): string[] {
  const home = homedir()
  if (isWindows) {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    return [join(home, '.local', 'bin'), join(appData, 'npm')]
  }
  return [join(home, '.local', 'bin'), join(home, '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin', join(home, '.npm-global', 'bin')]
}

export function childProcessPath(): Promise<string> {
  if (!cachedSearchPath) {
    cachedSearchPath = loginShellPath().then((path) => [path, ...wellKnownDirectories()].join(delimiter))
  }
  return cachedSearchPath
}

function executableNames(runner: RunnerKind): string[] {
  return isWindows ? [`${runner}.exe`, `${runner}.cmd`] : [runner]
}

/** Configured path wins; otherwise the first match on the search path. */
export async function locateRunner(runner: RunnerKind, configuredPath: string): Promise<string | null> {
  if (configuredPath.trim()) return existsSync(configuredPath.trim()) ? configuredPath.trim() : null
  const directories = (await childProcessPath()).split(delimiter).filter(Boolean)
  for (const directory of directories) {
    for (const name of executableNames(runner)) {
      const candidate = join(directory, name)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}
