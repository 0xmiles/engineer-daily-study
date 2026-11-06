import { useMemo, useState } from 'react'
import type { Topic } from '@shared/types'
import { api } from '../lib/api'
import { matchesFilters, matchesStatus, toggleValue, type KindFilter, type StatusFilter } from '../lib/studyNoteFilters'
import { useAsyncData } from '../state/useAsyncData'
import { useNavigate } from '../state/navigation'
import { useTopicOptions } from '../state/topics'
import { Button, Select, Tabs } from '../components/controls'
import { EmptyState, ErrorPanel, SkeletonList } from '../components/feedback'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { StudyNoteCard } from '../components/StudyNoteCard'

const STATUS_LABELS: Record<StatusFilter, string> = { todo: '할 일', done: '완료', all: '전체' }
const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'recommended', label: '추천받은 키워드' },
  { value: 'question', label: '문제에 필요한 개념' },
]

function TopicChip({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button aria-pressed={isActive} onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${isActive ? 'border-accent bg-accent text-accent-on' : 'border-line-strong text-ink-muted hover:text-ink'}`}>
      {label}
    </button>
  )
}

function NotesEmptyState({ hasAnyNotes, isTodoCleared }: { hasAnyNotes: boolean; isTodoCleared: boolean }) {
  const navigate = useNavigate()
  if (!hasAnyNotes) {
    return (
      <EmptyState
        title="아직 학습 노트가 없습니다"
        description="문제 은행에 문제가 생기면 그 문제에 필요한 개념이, 답안을 채점받거나 대화형 모의 면접을 마치면 감독관이 추천한 추가 학습 주제가 여기에 모입니다."
        action={<Button onClick={() => navigate({ name: 'today' })}>오늘의 문제 풀기</Button>}
      />
    )
  }
  if (isTodoCleared) return <EmptyState title="남은 공부거리가 없습니다" description="노트를 모두 공부했습니다. 새로 채점을 받거나 문제가 늘면 다시 쌓입니다." />
  return <EmptyState title="조건에 맞는 노트가 없습니다" description="상태, 종류, 주제, 노트 유무 조건을 바꿔 보세요." />
}

export function StudyNotesPage() {
  const { data: notes, error, isLoading, reload } = useAsyncData(() => api.listStudyNotes(), [])
  const [status, setStatus] = useState<StatusFilter>('todo')
  const [topics, setTopics] = useState<Topic[]>([])
  const [kind, setKind] = useState<KindFilter | ''>('')
  const [guideOnly, setGuideOnly] = useState(false)
  const topicOptions = useTopicOptions()

  const filteredNotes = useMemo(
    () => (notes ?? []).filter((note) => matchesFilters(note, { kind, topics, guideOnly })),
    [notes, kind, topics, guideOnly],
  )
  const visibleNotes = filteredNotes.filter((note) => matchesStatus(note, status))
  const statusTabs = (Object.keys(STATUS_LABELS) as StatusFilter[]).map((value) => ({
    value,
    label: `${STATUS_LABELS[value]} ${filteredNotes.filter((note) => matchesStatus(note, value)).length}`,
  }))
  const hasNoFilter = topics.length === 0 && !kind && !guideOnly

  return (
    <PageContainer>
      <PageHeader title="학습 노트" description="채점 결과와 모의 면접에서 추천된 공부거리와, 문제 은행의 문제를 푸는 데 필요한 개념을 키워드별로 모아 둡니다. 카드를 누르면 정리된 설명을 읽으며 공부할 수 있습니다." />
      <div className="mb-5 space-y-4">
        <div className="flex items-end justify-between gap-4">
          <Tabs tabs={statusTabs} active={status} onChange={setStatus} />
          <div className="flex items-end gap-4">
            <label className="flex h-[42px] cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={guideOnly} onChange={(event) => setGuideOnly(event.target.checked)} />
              노트 있는 것만
            </label>
            <div className="w-44"><Select label="종류" value={kind} options={KIND_OPTIONS} allowEmpty="전체" onChange={setKind} /></div>
          </div>
        </div>
        <div>
          <span className="label">주제 (여러 개 선택 가능)</span>
          <div className="flex flex-wrap gap-1.5">
            <TopicChip label="전체" isActive={topics.length === 0} onClick={() => setTopics([])} />
            {topicOptions.map((option) => (
              <TopicChip key={option.value} label={option.label} isActive={topics.includes(option.value)} onClick={() => setTopics((selected) => toggleValue(selected, option.value))} />
            ))}
          </div>
        </div>
      </div>
      {isLoading && <SkeletonList />}
      {error && <ErrorPanel message={error} onRetry={reload} />}
      {notes && visibleNotes.length === 0 && <NotesEmptyState hasAnyNotes={notes.length > 0} isTodoCleared={status === 'todo' && hasNoFilter} />}
      <ul className="space-y-3">
        {visibleNotes.map((note) => <StudyNoteCard key={note.key} note={note} />)}
      </ul>
    </PageContainer>
  )
}
