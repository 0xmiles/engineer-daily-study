import type { ReactNode } from 'react'

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="불러오는 중">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-sunken ${className}`} />
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="card space-y-3 p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

interface ErrorPanelProps {
  message: string
  detail?: string | null
  onRetry?: () => void
  isRetrying?: boolean
}

export function ErrorPanel({ message, detail, onRetry, isRetrying = false }: ErrorPanelProps) {
  return (
    <div className="rounded-2xl border border-bad/25 bg-bad-soft p-5">
      <p className="font-semibold text-bad">문제가 발생했습니다</p>
      <p className="mt-1 text-sm text-bad">{message}</p>
      {detail && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-bad">원문 로그 보기</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs">{detail}</pre>
        </details>
      )}
      {onRetry && (
        <button
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-bad px-3 py-1.5 text-sm font-semibold text-paper hover:bg-bad/90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isRetrying}
          onClick={onRetry}
        >
          {isRetrying && <Spinner size={14} />}
          다시 시도
        </button>
      )}
    </div>
  )
}

export function PageLoading({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-ink-muted">
      <Spinner /> {label}
    </div>
  )
}
