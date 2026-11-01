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

const STATUS_LABELS: Record<StatusFilter, string> = { todo: '할 일', done: '완료', all: '전체' }

function matchesStatus(note: StudyNote, status: StatusFilter): boolean {
  return status === 'all' || (status === 'done') === note.isDone
}

function NotesEmptyState({ hasAnyNotes, isTodoCleared }: { hasAnyNotes: boolean; isTodoCleared: boolean }) {
  const navigate = useNavigate()
  if (!hasAnyNotes) {
    return (
      <EmptyState
        title="아직 학습 노트가 없습니다"
        description="답안을 채점받거나 대화형 모의 면접을 마치면, 감독관이 추천한 추가 학습 주제가 여기에 모입니다."
        action={<Button onClick={() => navigate({ name: 'today' })}>오늘의 문제 풀기</Button>}
      />
    )
  }
  if (isTodoCleared) return <EmptyState title="남은 공부거리가 없습니다" description="추천받은 주제를 모두 공부했습니다. 새로 채점을 받으면 다시 쌓입니다." />
  return <EmptyState title="조건에 맞는 노트가 없습니다" description="상태나 주제 조건을 바꿔 보세요." />
}

export function StudyNotesPage() {
  const { data: notes, error, isLoading, reload } = useAsyncData(() => api.listStudyNotes(), [])
  const [status, setStatus] = useState<StatusFilter>('todo')
  const [topic, setTopic] = useState<Topic | ''>('')
  const topicOptions = useTopicOptions()

  const notesOnTopic = useMemo(() => (notes ?? []).filter((note) => !topic || note.topics.includes(topic)), [notes, topic])
  const visibleNotes = notesOnTopic.filter((note) => matchesStatus(note, status))
  const statusTabs = (Object.keys(STATUS_LABELS) as StatusFilter[]).map((value) => ({
    value,
    label: `${STATUS_LABELS[value]} ${notesOnTopic.filter((note) => matchesStatus(note, value)).length}`,
  }))

  return (
    <PageContainer>
      <PageHeader title="학습 노트" description="채점 결과와 모의 면접에서 추천된 공부거리를 모아 둡니다. 같은 주제가 여러 번 추천되면 하나로 묶입니다." />
      <div className="mb-5 flex items-end justify-between gap-4">
        <Tabs tabs={statusTabs} active={status} onChange={setStatus} />
        <div className="w-56"><Select label="주제" value={topic} options={topicOptions} allowEmpty="전체" onChange={setTopic} /></div>
      </div>
      {isLoading && <SkeletonList />}
      {error && <ErrorPanel message={error} onRetry={reload} />}
      {notes && visibleNotes.length === 0 && <NotesEmptyState hasAnyNotes={notes.length > 0} isTodoCleared={status === 'todo' && !topic} />}
      <ul className="space-y-3">
        {visibleNotes.map((note) => <StudyNoteCard key={note.key} note={note} />)}
      </ul>
    </PageContainer>
  )
}
