import type { Job, JobKind } from '@shared/types'
import { newId } from '../store/repositories'
import { CancelledError, RunnerError } from '../llm/skillRunner'

const MAX_KEPT_JOBS = 50

export interface JobContext {
  signal: AbortSignal
  setStage: (stage: string) => void
  setLabel: (label: string) => void
  setTarget: (targetId: string) => void
}

export interface JobHooks {
  onSucceeded?: () => void
  onFailed?: (message: string, detail: string) => void
  onCancelled?: () => void
}

export function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Runner output when the CLI failed, otherwise the stack trace. */
export function errorDetailOf(error: unknown): string {
  if (error instanceof RunnerError) return error.detail
  return error instanceof Error ? (error.stack ?? '') : ''
}

/** Background work with observable progress; listeners receive the full job list on every change. */
export class JobManager {
  private readonly jobs: Job[] = []
  private readonly controllers = new Map<string, AbortController>()

  constructor(private readonly onChanged: (jobs: Job[]) => void) {}

  list(): Job[] {
    return this.jobs.map((job) => ({ ...job }))
  }

  isRunning(kind: JobKind): boolean {
    return this.jobs.some((job) => job.kind === kind && job.status === 'running')
  }

  /** Jobs set their target as the first step of their work, so a job started a moment ago already counts. */
  isRunningFor(kind: JobKind, targetId: string): boolean {
    return this.jobs.some((job) => job.kind === kind && job.status === 'running' && job.targetId === targetId)
  }

  cancel(id: string): void {
    this.controllers.get(id)?.abort()
  }

  start(kind: JobKind, label: string, work: (context: JobContext) => Promise<void>, hooks: JobHooks = {}): string {
    const job: Job = { id: newId('job'), kind, label, stage: '대기 중', status: 'running', startedAt: new Date().toISOString(), finishedAt: null, error: null, errorDetail: null, targetId: null }
    const controller = new AbortController()
    this.jobs.unshift(job)
    this.dropOldFinishedJobs()
    this.controllers.set(job.id, controller)
    this.emit()
    const context: JobContext = {
      signal: controller.signal,
      setStage: (stage) => this.update(job, { stage }),
      setLabel: (label) => this.update(job, { label }),
      setTarget: (targetId) => this.update(job, { targetId }),
    }
    void this.execute(job, work, context, hooks)
    return job.id
  }

  private async execute(job: Job, work: (context: JobContext) => Promise<void>, context: JobContext, hooks: JobHooks): Promise<void> {
    try {
      await work(context)
      this.finish(job, { status: 'succeeded', stage: '완료' })
      hooks.onSucceeded?.()
    } catch (error) {
      if (error instanceof CancelledError) {
        this.finish(job, { status: 'cancelled', stage: '취소됨' })
        hooks.onCancelled?.()
        return
      }
      const message = errorMessageOf(error)
      const detail = errorDetailOf(error)
      this.finish(job, { status: 'failed', stage: '실패', error: message, errorDetail: detail })
      hooks.onFailed?.(message, detail)
    } finally {
      this.controllers.delete(job.id)
    }
  }

  // Running jobs are never dropped: isRunning and quit-time cancellation depend on finding them.
  private dropOldFinishedJobs(): void {
    const droppedJobs = new Set(this.jobs.filter((job) => job.status !== 'running').slice(MAX_KEPT_JOBS))
    const keptJobs = this.jobs.filter((job) => !droppedJobs.has(job))
    this.jobs.splice(0, this.jobs.length, ...keptJobs)
  }

  hasRunningJobs(): boolean {
    return this.jobs.some((job) => job.status === 'running')
  }

  private finish(job: Job, changes: Partial<Job>): void {
    this.update(job, { ...changes, finishedAt: new Date().toISOString() })
  }

  private update(job: Job, changes: Partial<Job>): void {
    Object.assign(job, changes)
    this.emit()
  }

  private emit(): void {
    this.onChanged(this.list())
  }
}

/** Runs tasks one at a time in call order. A task cancelled while waiting rejects at once and never starts. */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve()

  async run<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    const turn = this.tail
    let release!: () => void
    const finished = new Promise<void>((resolve) => (release = resolve))
    // The next task waits for this task's predecessor too, so leaving the line early never lets it jump ahead.
    this.tail = turn.then(() => finished)
    try {
      await waitForTurn(turn, signal)
      return await task()
    } finally {
      release()
    }
  }
}

function waitForTurn(turn: Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new CancelledError())
    const abort = () => reject(new CancelledError())
    signal.addEventListener('abort', abort, { once: true })
    void turn.then(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    })
  })
}
