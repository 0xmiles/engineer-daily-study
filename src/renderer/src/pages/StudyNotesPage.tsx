import { useEffect, useMemo, useState } from 'react'
import type { StudyNote } from '@shared/api'
import { api } from '../lib/api'
import {
  DEFAULT_NOTES_VIEW, isDefaultNotesView, matchesFilters, matchesStatus, toggleValue, type KindFilter, type NotesView, type StatusFilter,
} from '../lib/studyNoteFilters'
import { useAsyncData } from '../state/useAsyncData'
import { useNavigate } from '../state/navigation'
import { useTopicOptions } from '../state/topics'
import { AddStudyNoteForm } from '../components/AddStudyNoteForm'
import { Button, Select, Tabs, ToggleChip } from '../components/controls'
import { EmptyState, ErrorPanel, SkeletonList } from '../components/feedback'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { StudyNoteCard } from '../components/StudyNoteCard'
import { useToast } from '../components/toast'

const STATUS_LABELS: Record<StatusFilter, string> = { todo: '할 일', done: '완료', all: '전체' }
const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'recommended', label: '추천받은 키워드' },
  { value: 'question', label: '문제에 필요한 개념' },
  { value: 'manual', label: '직접 추가한 노트' },
]

// Kept outside the page, which unmounts when a note opens, so coming back finds the list as it was left. A restart starts over.
let lastNotesView: NotesView = DEFAULT_NOTES_VIEW

function useNotesView(): { view: NotesView; change: (changes: Partial<NotesView>) => void; reset: () => void } {
  const [view, setView] = useState(lastNotesView)
  useEffect(() => {
    lastNotesView = view
  }, [view])
  return {
    view,
    change: (changes) => setView((current) => ({ ...current, ...changes })),
    reset: () => setView(DEFAULT_NOTES_VIEW),
  }
}

function NotesEmptyState({ hasAnyNotes, isTodoCleared, onReset }: { hasAnyNotes: boolean; isTodoCleared: boolean; onReset: () => void }) {
  const navigate = useNavigate()
  if (!hasAnyNotes) {
    return (
      <EmptyState
        title="아직 학습 노트가 없습니다"
        description="문제 은행에 문제가 생기면 그 문제에 필요한 개념이, 답안을 채점받거나 대화형 모의 면접을 마치면 감독관이 추천한 추가 학습 주제가 여기에 모입니다. 공부하고 싶은 키워드를 직접 추가할 수도 있습니다."
        action={<Button onClick={() => navigate({ name: 'today' })}>오늘의 문제 풀기</Button>}
      />
    )
  }
  if (isTodoCleared) return <EmptyState title="남은 공부거리가 없습니다" description="노트를 모두 공부했습니다. 새로 채점을 받거나 문제가 늘면 다시 쌓입니다." />
  return <EmptyState title="조건에 맞는 노트가 없습니다" description="상태, 종류, 주제, 노트 유무 조건을 바꿔 보세요." action={<Button variant="secondary" onClick={onReset}>필터 초기화</Button>} />
}

export function StudyNotesPage() {
  const { data: notes, error, isLoading, reload } = useAsyncData(() => api.listStudyNotes(), [])
  const { view, change, reset } = useNotesView()
  const [isAdding, setIsAdding] = useState(false)
  const topicOptions = useTopicOptions()
  const navigate = useNavigate()
  const showToast = useToast()
  // A remembered topic that was deleted since would hide every note without a chip to turn it off.
  const topics = useMemo(() => view.topics.filter((topic) => topicOptions.some((option) => option.value === topic)), [view.topics, topicOptions])
  const { kind, guideOnly, status } = view

  const filteredNotes = useMemo(
    () => (notes ?? []).filter((note) => matchesFilters(note, { kind, topics, guideOnly })),
    [notes, kind, topics, guideOnly],
  )
  const visibleNotes = filteredNotes.filter((note) => matchesStatus(note, status))
  const statusTabs = (Object.keys(STATUS_LABELS) as StatusFilter[]).map((value) => ({
    value,
    label: `${STATUS_LABELS[value]} ${filteredNotes.filter((note) => matchesStatus(note, value)).length}`,
  }))
  const isDefault = isDefaultNotesView({ ...view, topics })

  const openAdded = (note: StudyNote): void => {
    if (note.addedAt === null) showToast({ tone: 'info', title: '이미 있는 노트를 열었습니다', message: '채점 추천이나 문제에서 나온 같은 키워드의 노트입니다.' })
    navigate({ name: 'studyNote', keyword: note.keyword })
  }

  return (
    <PageContainer>
      <PageHeader
        title="학습 노트"
        description="채점 결과와 모의 면접에서 추천된 공부거리와, 문제 은행의 문제를 푸는 데 필요한 개념을 키워드별로 모아 둡니다. 공부하고 싶은 키워드를 직접 추가할 수도 있습니다. 카드를 누르면 정리된 설명을 읽으며 공부할 수 있습니다."
        actions={!isAdding && <Button onClick={() => setIsAdding(true)}>노트 추가</Button>}
      />
      {isAdding && <AddStudyNoteForm onAdded={openAdded} onCancel={() => setIsAdding(false)} />}
      <div className="mb-5 space-y-4">
        <div className="flex items-end justify-between gap-4">
          <Tabs tabs={statusTabs} active={status} onChange={(value) => change({ status: value })} />
          <div className="flex items-end gap-4">
            <label className="flex h-[42px] cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={guideOnly} onChange={(event) => change({ guideOnly: event.target.checked })} />
              노트 있는 것만
            </label>
            <div className="w-44"><Select label="종류" value={kind} options={KIND_OPTIONS} allowEmpty="전체" onChange={(value) => change({ kind: value })} /></div>
          </div>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="label">주제 (여러 개 선택 가능)</span>
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip label="전체" isActive={topics.length === 0} onClick={() => change({ topics: [] })} />
              {topicOptions.map((option) => (
                <ToggleChip key={option.value} label={option.label} isActive={topics.includes(option.value)} onClick={() => change({ topics: toggleValue(topics, option.value) })} />
              ))}
            </div>
          </div>
          <Button variant="ghost" className="shrink-0" disabled={isDefault} onClick={reset}>필터 초기화</Button>
        </div>
      </div>
      {isLoading && <SkeletonList />}
      {error && <ErrorPanel message={error} onRetry={reload} />}
      {notes && visibleNotes.length === 0 && <NotesEmptyState hasAnyNotes={notes.length > 0} isTodoCleared={isDefault} onReset={reset} />}
      <ul className="space-y-3">
        {visibleNotes.map((note) => <StudyNoteCard key={note.key} note={note} />)}
      </ul>
    </PageContainer>
  )
}
