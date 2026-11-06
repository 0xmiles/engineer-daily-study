import { useMemo, useState } from 'react'
import type { StudyNote } from '@shared/api'
import type { Topic } from '@shared/types'
import { api } from '../lib/api'
import { useAsyncData } from '../state/useAsyncData'
import { useNavigate } from '../state/navigation'
import { useTopicOptions } from '../state/topics'
import { Button, Select, Tabs } from '../components/controls'
import { EmptyState, ErrorPanel, SkeletonList } from '../components/feedback'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { StudyNoteCard } from '../components/StudyNoteCard'

type StatusFilter = 'todo' | 'done' | 'all'
type KindFilter = 'recommended' | 'question'

const STATUS_LABELS: Record<StatusFilter, string> = { todo: '할 일', done: '완료', all: '전체' }
const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'recommended', label: '추천받은 키워드' },
  { value: 'question', label: '문제에 필요한 개념' },
]

function matchesStatus(note: StudyNote, status: StatusFilter): boolean {
  return status === 'all' || (status === 'done') === note.isDone
}

// A keyword a grading recommended and a question also needs counts as both.
function matchesKind(note: StudyNote, kind: KindFilter | ''): boolean {
  if (kind === 'recommended') return note.sources.length > 0
  if (kind === 'question') return note.questions.length > 0
  return true
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
  return <EmptyState title="조건에 맞는 노트가 없습니다" description="상태, 종류, 주제 조건을 바꿔 보세요." />
}

export function StudyNotesPage() {
  const { data: notes, error, isLoading, reload } = useAsyncData(() => api.listStudyNotes(), [])
  const [status, setStatus] = useState<StatusFilter>('todo')
  const [topic, setTopic] = useState<Topic | ''>('')
  const [kind, setKind] = useState<KindFilter | ''>('')
  const topicOptions = useTopicOptions()

  const notesOnTopic = useMemo(
    () => (notes ?? []).filter((note) => (!topic || note.topics.includes(topic)) && matchesKind(note, kind)),
    [notes, topic, kind],
  )
  const visibleNotes = notesOnTopic.filter((note) => matchesStatus(note, status))
  const statusTabs = (Object.keys(STATUS_LABELS) as StatusFilter[]).map((value) => ({
    value,
    label: `${STATUS_LABELS[value]} ${notesOnTopic.filter((note) => matchesStatus(note, value)).length}`,
  }))

  return (
    <PageContainer>
      <PageHeader title="학습 노트" description="채점 결과와 모의 면접에서 추천된 공부거리와, 문제 은행의 문제를 푸는 데 필요한 개념을 키워드별로 모아 둡니다. 카드를 누르면 정리된 설명을 읽으며 공부할 수 있습니다." />
      <div className="mb-5 flex items-end justify-between gap-4">
        <Tabs tabs={statusTabs} active={status} onChange={setStatus} />
        <div className="flex gap-3">
          <div className="w-44"><Select label="종류" value={kind} options={KIND_OPTIONS} allowEmpty="전체" onChange={setKind} /></div>
          <div className="w-56"><Select label="주제" value={topic} options={topicOptions} allowEmpty="전체" onChange={setTopic} /></div>
        </div>
      </div>
      {isLoading && <SkeletonList />}
      {error && <ErrorPanel message={error} onRetry={reload} />}
      {notes && visibleNotes.length === 0 && <NotesEmptyState hasAnyNotes={notes.length > 0} isTodoCleared={status === 'todo' && !topic && !kind} />}
      <ul className="space-y-3">
        {visibleNotes.map((note) => <StudyNoteCard key={note.key} note={note} />)}
      </ul>
    </PageContainer>
  )
}
