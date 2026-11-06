import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { StudyNote, StudyNoteQuestion, StudyNoteSource } from '@shared/api'
import { api, formatDateTime } from '../lib/api'
import { useNavigate } from '../state/navigation'
import { useRequest } from '../state/useRequest'
import { Spinner } from './feedback'

const MAX_MEMO_LENGTH = 5000

type MemoSaveState = 'idle' | 'saving' | 'saved' | 'failed'

export function searchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

export function SourceLink({ source }: { source: StudyNoteSource }) {
  const navigate = useNavigate()
  // Notes cards open the note on click, so the source link must not let the click through.
  const open = (event: MouseEvent): void => {
    event.stopPropagation()
    navigate(source.kind === 'attempt' ? { name: 'attempt', attemptId: source.id } : { name: 'interview', interviewId: source.id })
  }
  return (
    <p className="mt-1 text-xs text-ink-muted">
      <button className="font-medium text-accent-ink hover:underline" onClick={open}>{source.title}</button> · {formatDateTime(source.recommendedAt)}
    </p>
  )
}

/** Opens a bank question that needs the note's keyword; like SourceLink, the click must not open the note card. */
export function QuestionLink({ question }: { question: StudyNoteQuestion }) {
  const navigate = useNavigate()
  const open = (event: MouseEvent): void => {
    event.stopPropagation()
    navigate({ name: 'question', questionId: question.id })
  }
  return <button className="text-left font-medium text-accent-ink hover:underline" onClick={open}>{question.title}</button>
}

/** The card's one-line version of the questions that need the keyword: the newest one, then how many more. */
export function NeededByLine({ questions }: { questions: StudyNoteQuestion[] }) {
  if (questions.length === 0) return null
  const [newest, ...others] = questions
  return (
    <p className="mt-1 text-xs text-ink-muted">
      필요한 문제: <QuestionLink question={newest} />{others.length > 0 && ` 외 ${others.length}개`}
    </p>
  )
}

export function EarlierSources({ sources }: { sources: StudyNoteSource[] }) {
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

export function SearchLinks({ queries }: { queries: string[] }) {
  const unique = [...new Set(queries.map((query) => query.trim()).filter(Boolean))]
  if (unique.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {unique.map((query) => (
        <a key={query} href={searchUrl(query)} target="_blank" rel="noreferrer noopener" className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-muted hover:border-accent/40 hover:text-accent-ink">
          검색: {query} ↗
        </a>
      ))}
    </div>
  )
}

export function DoneToggle({ note }: { note: StudyNote }) {
  const request = useRequest()
  const toggle = (isDone: boolean): void => void request.run(() => api.updateStudyNote(note.key, { done: isDone }), '완료 표시를 바꾸지 못했습니다')
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium" onClick={(event) => event.stopPropagation()}>
      {request.isRunning && <Spinner size={12} />}
      <input type="checkbox" className="h-4 w-4 accent-accent" checked={note.isDone} disabled={request.isRunning} onChange={(event) => toggle(event.target.checked)} />
      공부 완료
    </label>
  )
}

function MemoSaveIndicator({ state }: { state: MemoSaveState }) {
  if (state === 'saving') return <span className="flex items-center gap-1"><Spinner size={12} /> 저장 중</span>
  if (state === 'saved') return <span>저장됨</span>
  if (state === 'failed') return <span className="text-bad">저장하지 못했습니다. 메모를 다시 눌렀다가 빠져나오면 다시 저장합니다.</span>
  return <span>입력란 밖을 누르면 저장됩니다</span>
}

export function MemoField({ note }: { note: StudyNote }) {
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
    <div>
      <textarea
        className="input h-40 text-sm leading-6"
        value={memo}
        maxLength={MAX_MEMO_LENGTH}
        placeholder="공부하며 정리한 내용, 헷갈렸던 점, 참고한 자료를 적어 두세요."
        onFocus={() => (isEditing.current = true)}
        onChange={(event) => setMemo(event.target.value)}
        onBlur={() => void save()}
      />
      <p className="mt-1 text-xs text-ink-faint"><MemoSaveIndicator state={saveState} /></p>
    </div>
  )
}
