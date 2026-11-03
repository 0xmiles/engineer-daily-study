import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attempt, Question } from '@shared/types'
import { api, countCharacters, errorMessage, formatDateTime } from '../lib/api'
import { useToast } from '../components/toast'
import { Button, ConfirmDialog, Tabs } from '../components/controls'
import { Spinner } from '../components/feedback'
import { Markdown } from '../components/Markdown'
import { QuestionStatement } from '../components/QuestionStatement'
import { HintPanel } from '../components/HintPanel'

const AUTOSAVE_DELAY_MILLISECONDS = 800
export type EditorMode = 'write' | 'preview'
type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'failed' }

export function useAutosave(attemptId: string, initialSavedAt: string | null) {
  const [saveState, setSaveState] = useState<SaveState>(initialSavedAt ? { kind: 'saved', at: initialSavedAt } : { kind: 'idle' })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAnswer = useRef<string | null>(null)
  const cancelPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pendingAnswer.current = null
  }, [])
  const saveNow = useCallback(async (answer: string) => {
    cancelPending()
    setSaveState({ kind: 'saving' })
    try {
      const saved = await api.saveDraft(attemptId, answer)
      setSaveState({ kind: 'saved', at: saved.draftSavedAt! })
    } catch {
      setSaveState({ kind: 'failed' })
    }
  }, [attemptId, cancelPending])
  const scheduleSave = useCallback((answer: string) => {
    cancelPending()
    pendingAnswer.current = answer
    timer.current = setTimeout(() => void saveNow(answer), AUTOSAVE_DELAY_MILLISECONDS)
  }, [cancelPending, saveNow])
  const flushPending = useCallback(() => {
    if (pendingAnswer.current !== null) void saveNow(pendingAnswer.current)
  }, [saveNow])
  useSaveOnLeave(flushPending)
  return { saveState, saveNow, scheduleSave, cancelPending }
}

/** Leaving the screen or closing the window must not drop the keystrokes still waiting for the autosave delay. */
function useSaveOnLeave(flushPending: () => void): void {
  useEffect(() => {
    window.addEventListener('beforeunload', flushPending)
    return () => {
      window.removeEventListener('beforeunload', flushPending)
      flushPending()
    }
  }, [flushPending])
}

export function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === 'saving') return <span className="flex items-center gap-1"><Spinner size={12} /> 저장 중</span>
  if (state.kind === 'saved') return <span>자동 저장됨 · {formatDateTime(state.at)}</span>
  if (state.kind === 'failed') return <span className="text-bad">저장하지 못했습니다. Cmd/Ctrl + S 로 다시 저장하세요.</span>
  return <span>입력하면 자동으로 저장됩니다</span>
}

function lengthTone(count: number, recommendedLength: Question['recommendedLength']): string {
  if (count < recommendedLength.min) return 'text-ink-muted'
  if (count > recommendedLength.max) return 'text-warn'
  return 'text-good'
}

export function LengthMeter({ answer, question }: { answer: string; question: Question }) {
  const count = countCharacters(answer)
  const { min, max } = question.recommendedLength
  return <span className={`text-xs font-medium ${lengthTone(count, question.recommendedLength)}`}>공백 제외 {count}자 / 권장 {min}~{max}자</span>
}

/** Stays submitting after success: the attempt moves to grading and the parent page replaces this view. */
export function useSubmitAttempt(attemptId: string, cancelPendingSave: () => void) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const showToast = useToast()
  const submit = async (answer: string): Promise<void> => {
    setIsSubmitting(true)
    cancelPendingSave()
    try {
      await api.submitAttempt(attemptId, answer)
    } catch (reason) {
      showToast({ tone: 'error', title: '제출하지 못했습니다', message: errorMessage(reason) })
      setIsSubmitting(false)
    }
  }
  return { isSubmitting, submit }
}

interface EditorShortcuts {
  onSave: () => void
  onRequestSubmit: () => void
  canSubmit: boolean
}

export function useEditorShortcuts({ onSave, onRequestSubmit, canSubmit }: EditorShortcuts): void {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key === 's') {
        event.preventDefault()
        onSave()
      }
      if (event.key === 'Enter' && canSubmit) {
        event.preventDefault()
        onRequestSubmit()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onSave, onRequestSubmit, canSubmit])
}

interface AnswerEditorProps {
  mode: EditorMode
  answer: string
  hasAnswer: boolean
  isSubmitting: boolean
  onChange: (answer: string) => void
}

export function AnswerEditor({ mode, answer, hasAnswer, isSubmitting, onChange }: AnswerEditorProps) {
  if (mode === 'preview') {
    return (
      <div className="card mt-4 min-h-0 flex-1 overflow-y-auto p-5">
        {hasAnswer ? <Markdown text={answer} /> : <p className="text-sm text-ink-faint">작성한 내용이 없습니다.</p>}
      </div>
    )
  }
  return (
    <textarea
      className="input mt-4 min-h-0 flex-1 resize-none px-5 py-4 text-[15px] leading-7"
      placeholder={'요구 사항 번호에 맞춰 답안을 작성하세요. 마크다운을 쓸 수 있습니다.\n\n### 1. ...'}
      value={answer}
      onChange={(event) => onChange(event.target.value)}
      disabled={isSubmitting}
      autoFocus
    />
  )
}

interface EditorHeaderProps {
  mode: EditorMode
  onModeChange: (mode: EditorMode) => void
  answer: string
  question: Question
}

export function EditorHeader({ mode, onModeChange, answer, question }: EditorHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <Tabs tabs={[{ value: 'write', label: '작성' }, { value: 'preview', label: '미리보기' }]} active={mode} onChange={onModeChange} />
      <LengthMeter answer={answer} question={question} />
    </div>
  )
}

interface EditorFooterProps {
  saveState: SaveState
  isSubmitting: boolean
  hasAnswer: boolean
  onRequestSubmit: () => void
}

export function EditorFooter({ saveState, isSubmitting, hasAnswer, onRequestSubmit }: EditorFooterProps) {
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-ink-muted">
      <SaveIndicator state={saveState} />
      <Button isLoading={isSubmitting} disabled={!hasAnswer} onClick={onRequestSubmit}>제출하기 (Cmd/Ctrl + Enter)</Button>
    </div>
  )
}

export function SubmitConfirmDialog({ isOpen, onConfirm, onCancel }: { isOpen: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      title="답안을 제출할까요?"
      description="제출하면 답안을 수정할 수 없고, 감독관 채점이 바로 시작됩니다. 채점에는 1~2분 정도 걸립니다."
      confirmLabel="제출하고 채점받기"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

export function SolveView({ attempt, question }: { attempt: Attempt; question: Question }) {
  const [answer, setAnswer] = useState(attempt.answer)
  const [mode, setMode] = useState<EditorMode>('write')
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const { saveState, saveNow, scheduleSave, cancelPending } = useAutosave(attempt.id, attempt.draftSavedAt)
  const { isSubmitting, submit } = useSubmitAttempt(attempt.id, cancelPending)
  const showToast = useToast()
  const hasAnswer = answer.trim() !== ''
  useEditorShortcuts({ onSave: () => void saveNow(answer), onRequestSubmit: () => setIsConfirmOpen(true), canSubmit: hasAnswer && !isSubmitting })

  const changeAnswer = (nextAnswer: string): void => {
    setAnswer(nextAnswer)
    scheduleSave(nextAnswer)
  }
  const confirmSubmit = (): void => {
    setIsConfirmOpen(false)
    void submit(answer)
  }
  // A pending autosave landing after the attempt is postponed would fail, since only drafts can be saved.
  const postpone = async (): Promise<void> => {
    cancelPending()
    try {
      await api.postponeAttempt(attempt.id, answer)
      showToast({ tone: 'info', title: '나중에 다시 풀기로 미뤘습니다', message: '며칠 뒤 오늘의 문제로 다시 나옵니다. 풀이 기록에서 먼저 풀 수도 있습니다.' })
    } catch (reason) {
      showToast({ tone: 'error', title: '미루지 못했습니다', message: errorMessage(reason) })
    }
  }

  return (
    <div className="grid h-full grid-cols-2 divide-x divide-line">
      <div className="overflow-y-auto px-10 pb-10 pt-4">
        <QuestionStatement question={question} />
        <HintPanel attempt={attempt} answer={answer} isSubmitting={isSubmitting} onPostpone={postpone} />
      </div>
      <div className="flex min-h-0 flex-col px-8 pb-6 pt-2">
        <EditorHeader mode={mode} onModeChange={setMode} answer={answer} question={question} />
        <AnswerEditor mode={mode} answer={answer} hasAnswer={hasAnswer} isSubmitting={isSubmitting} onChange={changeAnswer} />
        <EditorFooter saveState={saveState} isSubmitting={isSubmitting} hasAnswer={hasAnswer} onRequestSubmit={() => setIsConfirmOpen(true)} />
      </div>
      <SubmitConfirmDialog isOpen={isConfirmOpen} onConfirm={confirmSubmit} onCancel={() => setIsConfirmOpen(false)} />
    </div>
  )
}
