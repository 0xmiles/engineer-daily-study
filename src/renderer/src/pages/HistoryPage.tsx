import { useMemo, useState } from 'react'
import type { HistoryEntry, ScoreBucket } from '@shared/api'
import type { AttemptOrigin, Difficulty, QuestionCategory, Topic } from '@shared/types'
import { CATEGORIES, DIFFICULTIES, categoryLabel } from '@shared/taxonomy'
import { api, formatDate, formatDateTime } from '../lib/api'
import { useAsyncData } from '../state/useAsyncData'
import { useNavigate } from '../state/navigation'
import { useRequest } from '../state/useRequest'
import { useTopicOptions, useTopics } from '../state/topics'
import { EmptyState, ErrorPanel, Skeleton, SkeletonList } from '../components/feedback'
import { Button, Select } from '../components/controls'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { Badge, QuestionBadges } from '../components/QuestionBadges'

const STATUS_LABELS = { draft: '작성 중', grading: '채점 중', 'grading-failed': '채점 실패', graded: '채점 완료', postponed: '나중에 다시 풀기' }
const ORIGIN_LABELS: Record<AttemptOrigin, string> = { daily: '오늘의 문제', practice: '추가 풀이', interview: '모의 면접' }
const VISIBLE_BUCKET_COUNT = 5

function WeakestBuckets({ title, buckets, label }: { title: string; buckets: ScoreBucket[]; label: (key: string) => string }) {
  return (
    <div className="card p-5">
      <p className="mb-3 text-sm font-semibold">{title}</p>
      {buckets.length === 0 && <p className="text-xs text-ink-faint">채점 기록이 쌓이면 표시됩니다.</p>}
      <ul className="space-y-2">
        {buckets.slice(0, VISIBLE_BUCKET_COUNT).map((bucket) => (
          <li key={bucket.key}>
            <div className="flex justify-between text-xs"><span>{label(bucket.key)}</span><span className="font-semibold">{bucket.averageScore}점 · {bucket.count}회</span></div>
            <div className="mt-1.5 h-1.5 rounded-full bg-sunken"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${bucket.averageScore}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="mb-6 grid grid-cols-3 gap-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="card space-y-3 p-5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}

function StatsPanel() {
  const { data: stats, error, isLoading, reload } = useAsyncData(() => api.getStats(), [])
  const { label: topicLabel } = useTopics()
  if (isLoading) return <StatsSkeleton />
  if (error) return <div className="mb-6"><ErrorPanel message={`통계를 불러오지 못했습니다. ${error}`} onRetry={reload} /></div>
  if (!stats) return null
  return (
    <div className="mb-6 grid grid-cols-3 gap-3">
      <WeakestBuckets title="약한 주제 (평균 낮은 순)" buckets={stats.byTopic} label={(key) => topicLabel(key as Topic)} />
      <WeakestBuckets title="약한 유형" buckets={stats.byCategory} label={(key) => categoryLabel(key as QuestionCategory)} />
      <WeakestBuckets title="약한 채점 관점" buckets={stats.byPerspective} label={(key) => key} />
    </div>
  )
}

interface HistoryFilter { topic: Topic | ''; category: QuestionCategory | ''; difficulty: Difficulty | '' }

const EMPTY_FILTER: HistoryFilter = { topic: '', category: '', difficulty: '' }

const FILTER_FIELDS: (keyof HistoryFilter)[] = ['topic', 'category', 'difficulty']

/** An entry whose question was deleted matches only when no field is filtered. */
function matchesFilter(entry: HistoryEntry, filter: HistoryFilter): boolean {
  return FILTER_FIELDS.every((field) => !filter[field] || entry.question?.[field] === filter[field])
}

function HistoryEmptyState({ hasAnyEntries, onResetFilter }: { hasAnyEntries: boolean; onResetFilter: () => void }) {
  const navigate = useNavigate()
  if (hasAnyEntries) {
    return <EmptyState title="조건에 맞는 풀이가 없습니다" description="주제, 유형, 난이도 조건을 바꾸거나 초기화해 보세요." action={<Button variant="secondary" onClick={onResetFilter}>필터 초기화</Button>} />
  }
  return <EmptyState title="아직 풀이 기록이 없습니다" description="오늘의 문제를 풀고 제출하면 여기에 기록됩니다." action={<Button onClick={() => navigate({ name: 'today' })}>오늘의 문제 풀기</Button>} />
}

function HistoryFilterBar({ filter, onChange }: { filter: HistoryFilter; onChange: (filter: HistoryFilter) => void }) {
  const topicOptions = useTopicOptions()
  return (
    <div className="mb-4 grid grid-cols-3 gap-3">
      <Select label="주제" value={filter.topic} options={topicOptions} allowEmpty="전체" onChange={(topic) => onChange({ ...filter, topic })} />
      <Select label="유형" value={filter.category} options={CATEGORIES} allowEmpty="전체" onChange={(category) => onChange({ ...filter, category })} />
      <Select label="난이도" value={filter.difficulty} options={DIFFICULTIES} allowEmpty="전체" onChange={(difficulty) => onChange({ ...filter, difficulty })} />
    </div>
  )
}

function PostponedRow({ entry: { attempt, question } }: { entry: HistoryEntry }) {
  const navigate = useNavigate()
  const request = useRequest()
  const solveNow = async (): Promise<void> => {
    const attemptId = await request.run(() => api.startRetry(attempt.id), '다시 풀기를 시작하지 못했습니다')
    if (attemptId) navigate({ name: 'attempt', attemptId })
  }
  return (
    <li className="card flex items-center gap-4 p-5">
      <div className="min-w-0 flex-1">
        {question && <QuestionBadges question={question} />}
        <p className="mt-2 truncate font-semibold">{question?.title ?? '삭제된 문제'}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{attempt.retryOn ? `${formatDate(attempt.retryOn)}에 오늘의 문제로 다시 나옵니다` : '다시 나올 날짜가 없습니다'}</p>
      </div>
      <Button variant="ghost" onClick={() => navigate({ name: 'attempt', attemptId: attempt.id })}>미룬 답안 보기</Button>
      <Button variant="secondary" disabled={!question} isLoading={request.isRunning} onClick={() => void solveNow()}>지금 풀기</Button>
    </li>
  )
}

/** Questions put off after using every hint; shown only when there are some. */
function PostponedPanel() {
  const { data: entries } = useAsyncData(() => api.listPostponed(), [])
  if (!entries || entries.length === 0) return null
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-ink-muted">다시 풀 문제 {entries.length}개</h2>
      <ul className="space-y-2">{entries.map((entry) => <PostponedRow key={entry.attempt.id} entry={entry} />)}</ul>
    </section>
  )
}

function HistoryEntryRow({ entry: { attempt, question } }: { entry: HistoryEntry }) {
  const navigate = useNavigate()
  return (
    <li>
      <button className="card flex w-full items-center gap-4 p-5 text-left transition hover:border-accent/40" onClick={() => navigate({ name: 'attempt', attemptId: attempt.id })}>
        <div className="min-w-0 flex-1">
          {question && <QuestionBadges question={question} />}
          <p className="mt-2 truncate font-semibold">{question?.title ?? '삭제된 문제'}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{formatDateTime(attempt.submittedAt ?? attempt.createdAt)} · {ORIGIN_LABELS[attempt.origin]}</p>
        </div>
        {attempt.grading ? <span className="text-2xl font-bold tracking-tight">{attempt.grading.totalScore}<span className="text-sm font-medium text-ink-faint">점</span></span> : <Badge>{STATUS_LABELS[attempt.status]}</Badge>}
      </button>
    </li>
  )
}

export function HistoryPage() {
  const { data: entries, error, isLoading, reload } = useAsyncData(() => api.listHistory(), [])
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_FILTER)
  const visibleEntries = useMemo(() => (entries ?? []).filter((entry) => matchesFilter(entry, filter)), [entries, filter])

  return (
    <PageContainer wide>
      <PageHeader title="풀이 기록" description="지난 풀이와 채점 결과, 약점 통계를 확인합니다." />
      <StatsPanel />
      <PostponedPanel />
      <HistoryFilterBar filter={filter} onChange={setFilter} />
      {isLoading && <SkeletonList />}
      {error && <ErrorPanel message={error} onRetry={reload} />}
      {entries && visibleEntries.length === 0 && <HistoryEmptyState hasAnyEntries={entries.length > 0} onResetFilter={() => setFilter(EMPTY_FILTER)} />}
      <ul className="space-y-2">
        {visibleEntries.map((entry) => <HistoryEntryRow key={entry.attempt.id} entry={entry} />)}
      </ul>
    </PageContainer>
  )
}
