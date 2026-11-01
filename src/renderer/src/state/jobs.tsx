import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Job, JobKind } from '@shared/types'
import { api, errorMessage } from '../lib/api'
import { useToast } from '../components/toast'
import { useNavigate, type Navigate } from './navigation'

const JobsContext = createContext<Job[]>([])

export function useJobs(): Job[] {
  return useContext(JobsContext)
}

export function useJob(jobId: string | null): Job | null {
  return useJobs().find((job) => job.id === jobId) ?? null
}

/** Finds the running job of the given kind, limited to one target when a target id is given. */
export function useRunningJob(kind: JobKind, targetId?: string): Job | undefined {
  return useJobs().find((job) => job.kind === kind && job.status === 'running' && (targetId === undefined || job.targetId === targetId))
}

// Interview turns come back while the user is watching the conversation, so a success toast would only interrupt.
const QUIET_SUCCESS_KINDS: JobKind[] = ['interview-turn']

/** Keeps the job list in sync with the main process and announces every finished job with a toast. */
export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const previousStatuses = useRef(new Map<string, Job['status']>())
  const showToast = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    void api.listJobs().then(setJobs)
    return api.onJobsChanged(setJobs)
  }, [])

  useEffect(() => {
    for (const job of jobs) {
      const previous = previousStatuses.current.get(job.id)
      previousStatuses.current.set(job.id, job.status)
      if (previous !== 'running' || job.status === 'running') continue
      if (job.status === 'succeeded' && !QUIET_SUCCESS_KINDS.includes(job.kind)) showToast({ tone: 'success', title: `${job.label} 완료`, action: successAction(job, navigate) })
      if (job.status === 'failed') showToast({ tone: 'error', title: `${job.label} 실패`, message: job.error ?? undefined, action: failureAction(job, showToast) })
    }
  }, [jobs, showToast, navigate])

  return <JobsContext.Provider value={jobs}>{children}</JobsContext.Provider>
}

function successAction(job: Job, navigate: Navigate) {
  const targetId = job.targetId
  if (!targetId) return undefined
  switch (job.kind) {
    case 'grade-answer': return { label: '결과 보기', onClick: () => navigate({ name: 'attempt', attemptId: targetId }) }
    case 'draft-rubric':
    case 'generate-question': return { label: '문제 보기', onClick: () => navigate({ name: 'question', questionId: targetId }) }
    case 'practice-question': return { label: '풀러 가기', onClick: () => navigate({ name: 'attempt', attemptId: targetId }) }
    case 'hint':
    case 'follow-up-questions':
    case 'follow-up-evaluation':
    case 'inquiry': return { label: '보기', onClick: () => navigate({ name: 'attempt', attemptId: targetId }) }
    case 'prepare-interview':
    case 'interview-turn':
    case 'interview-report': return { label: '면접 보기', onClick: () => navigate({ name: 'interview', interviewId: targetId }) }
    case 'study-guide': return { label: '노트 보기', onClick: () => navigate({ name: 'studyNote', keyword: targetId }) }
    default: return undefined
  }
}

function failureAction(job: Job, showToast: ReturnType<typeof useToast>) {
  if (job.kind !== 'grade-answer' || !job.targetId) return undefined
  return {
    label: '다시 시도',
    onClick: () => void api.retryGrading(job.targetId!).catch((error) => showToast({ tone: 'error', title: '다시 채점하지 못했습니다', message: errorMessage(error) })),
  }
}
