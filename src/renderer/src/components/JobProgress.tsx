import { useEffect, useState } from 'react'
import type { Job } from '@shared/types'
import { api } from '../lib/api'
import { useJobs } from '../state/jobs'
import { Button } from './controls'
import { Spinner } from './feedback'

function useElapsedSeconds(startedAt: string, isRunning: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!isRunning) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isRunning])
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
}

function formatElapsed(seconds: number): string {
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`
}

/** Large in-page progress for an LLM job: current stage, elapsed time and a cancel button. */
export function JobProgressPanel({ job, title, hint }: { job: Job; title: string; hint?: string }) {
  const elapsed = useElapsedSeconds(job.startedAt, job.status === 'running')
  const [isCancelling, setIsCancelling] = useState(false)
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <Spinner size={32} className="text-indigo-600" />
      <p className="mt-5 text-base font-semibold">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{job.stage} · {formatElapsed(elapsed)} 경과</p>
      {hint && <p className="mt-3 max-w-md text-xs text-slate-400">{hint}</p>}
      <Button variant="secondary" className="mt-6" isLoading={isCancelling} onClick={() => { setIsCancelling(true); void api.cancelJob(job.id) }}>
        취소
      </Button>
    </div>
  )
}

function RunningJobRow({ job }: { job: Job }) {
  const elapsed = useElapsedSeconds(job.startedAt, true)
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <Spinner size={14} className="shrink-0 text-indigo-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{job.label}</p>
        <p className="text-xs text-slate-500">{job.stage} · {formatElapsed(elapsed)}</p>
      </div>
      <button className="text-xs text-slate-500 hover:text-rose-600" onClick={() => void api.cancelJob(job.id)}>취소</button>
    </li>
  )
}

/** Top-bar indicator of background jobs that keep running while the user moves between screens. */
export function JobIndicator() {
  const runningJobs = useJobs().filter((job) => job.status === 'running')
  const [isOpen, setIsOpen] = useState(false)
  if (runningJobs.length === 0) return null
  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" onClick={() => setIsOpen(!isOpen)}>
        <Spinner size={12} /> 진행 중인 작업 {runningJobs.length}개
      </button>
      {isOpen && (
        <ul className="card absolute right-0 top-10 z-30 w-96 divide-y divide-slate-100 dark:divide-slate-800">
          {runningJobs.map((job) => <RunningJobRow key={job.id} job={job} />)}
        </ul>
      )}
    </div>
  )
}
