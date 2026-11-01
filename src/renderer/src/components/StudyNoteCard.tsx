import { useEffect, useRef, useState } from 'react'
import type { StudyNote, StudyNoteSource } from '@shared/api'
import { api, formatDateTime } from '../lib/api'
import { useNavigate } from '../state/navigation'
import { useRequest } from '../state/useRequest'
import { useTopics } from '../state/topics'
import { Spinner } from './feedback'
import { Badge } from './QuestionBadges'

const MAX_MEMO_LENGTH = 5000

type MemoSaveState = 'idle' | 'saving' | 'saved' | 'failed'

function searchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

function SourceLink({ source }: { source: StudyNoteSource }) {
  const navigate = useNavigate()
  const open = (): void => navigate(source.kind === 'attempt' ? { name: 'attempt', attemptId: source.id } : { name: 'interview', interviewId: source.id })
  return (
    <p className="mt-1 text-xs text-ink-muted">
      <button className="font-medium text-accent-ink hover:underline" onClick={open}>{source.title}</button> · {formatDateTime(source.recommendedAt)}
    </p>
  )
}

function EarlierSources({ sources }: { sources: StudyNoteSource[] }) {
  if (sources.length === 0) return null
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium text-ink-muted">이전 추천 {sources.length}개 보기</summary>
      <ul className="mt-2 space-y-3 border-l-2 border-line pl-3">
        {sources.map((source) => (
          <li key={`${source.kind}:${source.id}`}>
            <p className="text-sm">{source.reason}</p>
            <SourceLink source={source} />
          </li>
        ))}
      </ul>
    </details>
  )
}

function SearchLinks({ sources }: { sources: StudyNoteSource[] }) {
  const queries = [...new Set(sources.map((source) => source.searchQuery.trim()).filter(Boolean))]
  if (queries.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {queries.map((query) => (
        <a key={query} href={searchUrl(query)} target="_blank" rel="noreferrer noopener" className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-muted hover:border-accent/40 hover:text-accent-ink">
          검색: {query} ↗
        </a>
      ))}
    </div>
  )
}

function MemoSaveIndicator({ state }: { state: MemoSaveState }) {
  if (state === 'saving') return <span className="flex items-center gap-1"><Spinner size={12} /> 저장 중</span>
  if (state === 'saved') return <span>저장됨</span>
  if (state === 'failed') return <span className="text-bad">저장하지 못했습니다. 메모를 다시 눌렀다가 빠져나오면 다시 저장합니다.</span>
  return <span>입력란 밖을 누르면 저장됩니다</span>
}

function MemoField({ note }: { note: StudyNote }) {
  const [memo, setMemo] = useState(note.memo)
  const [saveState, setSaveState] = useState<MemoSaveState>('idle')
  const isEditing = useRef(false)
  const latest = useRef({ memo, savedMemo: note.memo })
  latest.current = { memo, savedMemo: note.memo }

  // A reload while the user is typing must not overwrite what they are writing.
  useEffect(() => {
    if (!isEditing.current) setMemo(note.memo)
  }, [note.memo])

  // Leaving the page with the memo still focused would otherwise drop it, since no blur arrives.
  useEffect(() => () => {
    const { memo: pendingMemo, savedMemo } = latest.current
    if (pendingMemo !== savedMemo) void api.updateStudyNote(note.key, { memo: pendingMemo }).catch(() => undefined)
  }, [note.key])

  const save = async (): Promise<void> => {
    isEditing.current = false
    if (memo === note.memo) return
    setSaveState('saving')
    try {
      await api.updateStudyNote(note.key, { memo })
      setSaveState('saved')
    } catch {
      setSaveState('failed')
    }
  }

  return (
    <div className="mt-4">
      <textarea
        className="input h-20 text-sm"
        value={memo}
        maxLength={MAX_MEMO_LENGTH}
        placeholder="공부한 내용이나 참고한 자료를 적어 두세요."
        onFocus={() => (isEditing.current = true)}
        onChange={(event) => setMemo(event.target.value)}
        onBlur={() => void save()}
      />
      <p className="mt-1 text-xs text-ink-faint"><MemoSaveIndicator state={saveState} /></p>
    </div>
  )
}

export function StudyNoteCard({ note }: { note: StudyNote }) {
  const { label: topicLabel } = useTopics()
  const doneRequest = useRequest()
  const [latestSource, ...earlierSources] = note.sources
  const toggleDone = (isDone: boolean): void => void doneRequest.run(() => api.updateStudyNote(note.key, { done: isDone }), '완료 표시를 바꾸지 못했습니다')

  return (
    <li className={`card p-5 ${note.isDone ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <Badge className="bg-accent-soft text-accent-ink">추천 {note.sources.length}회</Badge>
            {note.isReopened && <Badge className="bg-warn-soft text-warn">다시 추천됨</Badge>}
            {note.topics.map((topic) => <Badge key={topic}>{topicLabel(topic)}</Badge>)}
          </div>
          <p className={`mt-2 text-lg font-bold leading-snug tracking-tight ${note.isDone ? 'line-through decoration-ink-faint' : ''}`}>{note.keyword}</p>
          <p className="mt-1 text-sm leading-6">{latestSource.reason}</p>
          <SourceLink source={latestSource} />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
          {doneRequest.isRunning && <Spinner size={12} />}
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={note.isDone} disabled={doneRequest.isRunning} onChange={(event) => toggleDone(event.target.checked)} />
          공부 완료
        </label>
      </div>
      <EarlierSources sources={earlierSources} />
      <SearchLinks sources={note.sources} />
      <MemoField note={note} />
    </li>
  )
}
