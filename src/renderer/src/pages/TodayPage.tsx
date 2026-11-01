import { useState } from 'react'
import type { TodayItemView } from '@shared/api'
import type { Attempt, DailyItemKind } from '@shared/types'
import { categoryLabel, topicLabel } from '@shared/taxonomy'
import { api, errorMessage, formatDate } from '../lib/api'
import { useAsyncData } from '../state/useAsyncData'
import { useNavigate } from '../state/navigation'
import { useJobs, useRunningJob } from '../state/jobs'
import { useRequest } from '../state/useRequest'
import { useToast } from '../components/toast'
import { Button } from '../components/controls'
import { ErrorPanel, SkeletonList, Spinner } from '../components/feedback'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { Badge, QuestionBadges } from '../components/QuestionBadges'

const PREPARE_FAILURE_TITLE = '문제 준비를 시작하지 못했습니다'

const KIND_LABELS: Record<DailyItemKind, string> = { scenario: '오늘의 시나리오', concept: '오늘의 개념', weakness: '약점 복습' }

function attemptStatus(attempt: Attempt | null): { label: string; className: string; action: string } {
  if (!attempt) return { label: '미풀이', className: '', action: '풀기 시작' }
  switch (attempt.status) {
    case 'draft': return { label: '작성 중', className: 'bg-warn-soft text-warn', action: '이어 쓰기' }
    case 'grading': return { label: '채점 중', className: 'bg-info-soft text-info', action: '진행 상황 보기' }
    case 'grading-failed': return { label: '채점 실패', className: 'bg-bad-soft text-bad', action: '확인하기' }
    case 'graded': return { label: `${attempt.grading?.totalScore ?? 0}점`, className: 'bg-good-soft text-good', action: '결과 보기' }
  }
}

interface PendingItemCardProps {
  item: TodayItemView
  isPreparing: boolean
  onRetry: () => Promise<unknown>
  onPrepare: () => Promise<unknown>
}

function PendingItemCard({ item, isPreparing, onRetry, onPrepare }: PendingItemCardProps) {
  const request = useRequest()
  const specText = [item.spec.topic && topicLabel(item.spec.topic), item.spec.category && categoryLabel(item.spec.category)].filter(Boolean).join(' · ')
  if (item.generationError) {
    const retry = (): void => void request.run(onRetry, '문제를 다시 만들지 못했습니다')
    return <ErrorPanel message={`문제를 만들지 못했습니다. ${item.generationError}`} detail={item.generationErrorDetail ?? null} onRetry={retry} isRetrying={request.isRunning} />
  }
  return (
    <div className="flex items-center gap-4">
      {isPreparing ? <Spinner size={20} className="text-accent" /> : null}
      <div className="flex-1">
        <p className="font-semibold">{isPreparing ? '문제를 만드는 중입니다' : '문제 준비 대기 중'}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{specText} · 문제 은행에 맞는 문제가 없어 새로 만듭니다. 1~2분 정도 걸립니다.</p>
      </div>
      {!isPreparing && <Button variant="secondary" isLoading={request.isRunning} onClick={() => void request.run(onPrepare, PREPARE_FAILURE_TITLE)}>지금 준비</Button>}
    </div>
  )
}

/** A failure of the whole preparation job (not of a single item) keeps its raw runner log only on the in-memory job. */
function PreparationFailure({ onPrepare }: { onPrepare: () => Promise<unknown> }) {
  const latestPreparation = useJobs().find((job) => job.kind === 'prepare-daily')
  const request = useRequest()
  if (latestPreparation?.status !== 'failed') return null
  const retry = (): void => void request.run(onPrepare, PREPARE_FAILURE_TITLE)
  return (
    <div className="mb-3">
      <ErrorPanel message={latestPreparation.error ?? '오늘의 문제를 준비하지 못했습니다.'} detail={latestPreparation.errorDetail} onRetry={retry} isRetrying={request.isRunning} />
    </div>
  )
}

function ReadyItemCard({ item, onOpen, isOpening }: { item: TodayItemView; onOpen: () => void; isOpening: boolean }) {
  const status = attemptStatus(item.attempt)
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <QuestionBadges question={item.question!} />
        <p className="mt-3 text-lg font-bold leading-snug tracking-tight">{item.question!.title}</p>
      </div>
      <Badge className={status.className || undefined}>{status.label}</Badge>
      <Button variant={item.attempt?.status === 'graded' ? 'secondary' : 'primary'} isLoading={isOpening} onClick={onOpen}>{status.action}</Button>
    </div>
  )
}

/** Keeps the opening index after success because navigation leaves this page. */
function useOpenDailyItem(date: string | undefined) {
  const navigate = useNavigate()
  const showToast = useToast()
  const [openingIndex, setOpeningIndex] = useState<number | null>(null)
  const openItem = async (index: number): Promise<void> => {
    setOpeningIndex(index)
    try {
      navigate({ name: 'attempt', attemptId: await api.startDailyAttempt(date!, index) })
    } catch (reason) {
      showToast({ tone: 'error', title: '문제를 열지 못했습니다', message: errorMessage(reason) })
      setOpeningIndex(null)
    }
  }
  return { openingIndex, openItem }
}

export function TodayPage() {
  const { data: today, error, isLoading, reload } = useAsyncData(() => api.getToday(), [])
  const navigate = useNavigate()
  const { openingIndex, openItem } = useOpenDailyItem(today?.date)
  const isPreparing = useRunningJob('prepare-daily') !== undefined

  const prepare = (): Promise<void> => api.prepareToday().then(reload)

  return (
    <PageContainer>
      <PageHeader title="오늘의 문제" description={today ? formatDate(today.date) : ' '} actions={<Button variant="secondary" onClick={() => navigate({ name: 'practice' })}>추가로 더 풀기</Button>} />
      {isLoading && <SkeletonList rows={2} />}
      {error && <ErrorPanel message={error} onRetry={reload} />}
      {today && <PreparationFailure onPrepare={prepare} />}
      {today && (
        <div className="space-y-3">
          {today.items.map((item, index) => (
            <section key={index} className="card p-6">
              <p className="mb-4 text-xs font-semibold tracking-wide text-accent-ink">{KIND_LABELS[item.kind]}</p>
              {item.question
                ? <ReadyItemCard item={item} isOpening={openingIndex === index} onOpen={() => void openItem(index)} />
                : <PendingItemCard item={item} isPreparing={isPreparing} onRetry={() => api.retryDailyItem(today.date, index).then(reload)} onPrepare={prepare} />}
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
