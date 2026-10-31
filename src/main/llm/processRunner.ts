import type { ChildProcess } from 'node:child_process'
// cross-spawn resolves Windows `.cmd` wrappers (npm-installed CLIs) that plain spawn cannot run.
import spawn from 'cross-spawn'

const PROCESS_TIMEOUT_MILLISECONDS = 10 * 60 * 1000
const FORCE_KILL_DELAY_MILLISECONDS = 5_000
const isWindows = process.platform === 'win32'

export interface ProcessRequest {
  executable: string
  args: string[]
  stdin: string
  cwd: string
  env: NodeJS.ProcessEnv
  signal: AbortSignal
}

export interface ProcessResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export class CancelledError extends Error {
  constructor() {
    super('작업이 취소되었습니다.')
  }
}

export class TimeoutError extends Error {
  constructor() {
    super(`모델 응답이 ${PROCESS_TIMEOUT_MILLISECONDS / 60_000}분 안에 오지 않아 작업을 중단했습니다.`)
  }
}

/**
 * npm-installed CLIs run behind a `.cmd` (Windows) or shell wrapper, so killing only the direct child leaves
 * the real node process alive and holding stdout. Kill the whole tree instead.
 */
function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return
  if (isWindows) killWindowsTree(child, child.pid)
  else killProcessGroup(child, child.pid)
}

function killWindowsTree(child: ChildProcess, pid: number): void {
  spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }).on('error', () => child.kill())
}

// A CLI that ignores SIGTERM would otherwise keep running and spending tokens.
function killProcessGroup(child: ChildProcess, pid: number): void {
  const signalGroup = (signal: NodeJS.Signals): void => {
    try {
      process.kill(-pid, signal)
    } catch {
      child.kill(signal)
    }
  }
  signalGroup('SIGTERM')
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) signalGroup('SIGKILL')
  }, FORCE_KILL_DELAY_MILLISECONDS).unref()
}

function spawnChild(request: ProcessRequest): ChildProcess {
  // detached gives the child its own process group on POSIX so the group can be killed; on Windows it would open a console.
  const child = spawn(request.executable, request.args, { cwd: request.cwd, env: request.env, windowsHide: true, detached: !isWindows })
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  // A CLI that exits before reading all of stdin raises EPIPE here; the exit code already reports the failure.
  child.stdin?.on('error', () => {})
  return child
}

function collectOutput(child: ChildProcess): () => { stdout: string; stderr: string } {
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk: string) => (stdout += chunk))
  child.stderr?.on('data', (chunk: string) => (stderr += chunk))
  return () => ({ stdout, stderr })
}

/** Cancellation and timeouts reject at once and kill the tree; they do not wait for the CLI to exit. */
export function runProcess(request: ProcessRequest): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (request.signal.aborted) return reject(new CancelledError())
    const child = spawnChild(request)
    const output = collectOutput(child)
    const timeout = setTimeout(() => stop(new TimeoutError()), PROCESS_TIMEOUT_MILLISECONDS)
    const abort = (): void => stop(new CancelledError())
    request.signal.addEventListener('abort', abort, { once: true })

    function settle(finish: () => void): void {
      clearTimeout(timeout)
      request.signal.removeEventListener('abort', abort)
      finish()
    }
    function stop(error: Error): void {
      settle(() => {
        killProcessTree(child)
        reject(error)
      })
    }

    child.on('error', (error) => settle(() => reject(error)))
    child.on('close', (exitCode) => settle(() => resolve({ ...output(), exitCode })))
    child.stdin?.end(request.stdin, 'utf8')
  })
}
