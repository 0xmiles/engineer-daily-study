import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { TimedInterviewItemView, TimedInterviewView } from '@shared/api'
import { api, countCharacters, errorMessage, formatDateTime } from '../lib/api'
import { useNavigate } from '../state/navigation'
import { useRunningJob } from '../state/jobs'
import { useRequest } from '../state/useRequest'
import { useToast } from '../components/toast'
import { Button, ConfirmDialog } from '../components/controls'
import { EmptyState, ErrorPanel, PageLoading, Spinner } from '../components/feedback'
import { JobProgressPanel } from '../components/JobProgress'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { Badge, QuestionBadges } from '../components/QuestionBadges'
import { QuestionStatement } from '../components/QuestionStatement'
import { InterviewBadges, MODE_LABELS, formatDuration, gradingCount, interviewScore, scoreTone, useNow } from '../components/InterviewShared'
import { AnswerEditor, EditorHeader, SaveIndicator, useAutosave, type EditorMode } from './SolveView'

const WARNING_SECONDS = 60
const ABANDON_DESCRIPTION = '지금 풀던 문제의 답안은 버려지고, 아직 풀지 않은 문제는 결과에서 빠집니다. 이미 제출한 문제는 채점 결과가 남습니다.'

function AbandonButton({ interviewId, description }: { interviewId: string; description: string }) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const request = useRequest()
  const abandon = (): void => {
    setIsConfirmOpen(false)
    void request.run(() => api.abandonInterview(interviewId), '면접을 그만두지 못했습니다')
  }
  return (
    <>
      <Button variant="secondary" isLoading={request.isRunning} onClick={() => setIsConfirmOpen(true)}>면접 그만두기</Button>
      <ConfirmDialog isOpen={isConfirmOpen} title="면접을 그만둘까요?" description={description} confirmLabel="그만두기" tone="danger" onConfirm={abandon} onCancel={() => setIsConfirmOpen(false)} />
    </>
  )
}

function SessionHeader({ interview, actions }: { interview: TimedInterviewView; actions?: ReactNode }) {
  return (
    <>
      <PageHeader title={MODE_LABELS.timed} description={`${interview.items.length}문제 · 문제당 ${interview.timeLimitMinutes}분 · ${formatDateTime(interview.createdAt)} 시작`} actions={actions} />
      <div className="-mt-5 mb-6"><InterviewBadges interview={interview} /></div>
    </>
  )
}

function PreparingPanel({ interview }: { interview: TimedInterviewView }) {
  const job = useRunningJob('prepare-interview', interview.id)
  const readyCount = interview.items.filter((item) => item.questionId).length
  if (!job) return <PageLoading label="준비 상태를 확인하는 중" />
  return (
    <JobProgressPanel
      job={job}
      title={`면접 문제를 준비하고 있습니다 (${readyCount}/${interview.items.length})`}
      hint="문제 은행에 없는 문제를 새로 만듭니다. 준비가 끝나면 첫 문제를 시작할 수 있고, 그때부터 시간을 잽니다."
    />
  )
}

function PreparationFailedPanel({ interview }: { interview: TimedInterviewView }) {
  const request = useRequest()
  const retry = (): void => void request.run(() => api.retryInterviewPreparation(interview.id), '다시 준비하지 못했습니다')
  return <ErrorPanel message={interview.preparationError ?? '면접 문제를 준비하지 못했습니다.'} detail={interview.preparationErrorDetail ?? null} onRetry={retry} isRetrying={request.isRunning} />
}

function ItemIntro({ interview, index }: { interview: TimedInterviewView; index: number }) {
  const request = useRequest()
  const begin = (): void => void request.run(() => api.beginTimedItem(interview.id), '문제를 시작하지 못했습니다')
  const isFirst = index === 0
  return (
    <section className="card flex flex-col items-center px-6 py-14 text-center">
      <p className="text-xs font-semibold tracking-wide text-accent-ink">문제 {index + 1} / {interview.items.length}</p>
      <p className="mt-3 text-xl font-bold tracking-tight">{isFirst ? '준비되었습니다' : `${index}번 문제를 제출했습니다`}</p>
      <p className="mt-3 max-w-md text-sm leading-6 text-ink-muted">
        {isFirst
          ? `시작하면 바로 ${interview.timeLimitMinutes}분 타이머가 돌아갑니다. 시간이 끝나면 쓴 데까지 자동으로 제출되고, 제출한 문제로는 돌아올 수 없습니다.`
          : '잠시 숨을 고르세요. 준비되면 다음 문제를 시작합니다. 앞 문제의 결과는 면접을 마친 뒤에 보여 드립니다.'}
      </p>
      <Button className="mt-7" isLoading={request.isRunning} onClick={begin}>{index + 1}번 문제 시작</Button>
    </section>
  )
}

function Countdown({ remainingSeconds }: { remainingSeconds: number }) {
  const tone = remainingSeconds <= WARNING_SECONDS ? 'bg-warn-soft text-warn' : 'bg-sunken text-ink'
  return <span className={`rounded-full px-3 py-1 text-sm font-bold tabular-nums ${tone}`}>남은 시간 {formatDuration(remainingSeconds)}</span>
}

/** Submits once; on success the item is marked submitted and this view is replaced, so it stays in the submitting state. */
function useSubmitItem(interviewId: string, cancelPendingSave: () => void) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSubmittingRef = useRef(false)
  const showToast = useToast()
  const submit = useCallback(async (answer: string, timedOut: boolean): Promise<void> => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setIsSubmitting(true)
    cancelPendingSave()
    try {
      await api.submitTimedItem(interviewId, answer, timedOut)
    } catch (reason) {
      showToast({ tone: 'error', title: '제출하지 못했습니다', message: errorMessage(reason) })
      isSubmittingRef.current = false
      setIsSubmitting(false)
    }
  }, [interviewId, cancelPendingSave, showToast])
  return { isSubmitting, submit }
}

interface TimedSolveProps {
  interview: TimedInterviewView
  item: TimedInterviewItemView
  index: number
}

/** The answer sheet of one item: the timer counts from the item's start, so reopening the app does not reset it. */
function TimedSolve({ interview, item, index }: TimedSolveProps) {
  const attempt = item.attempt!
  const question = item.question!
  const [answer, setAnswer] = useState(attempt.answer)
  const [mode, setMode] = useState<EditorMode>('write')
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const { saveState, saveNow, scheduleSave, cancelPending } = useAutosave(attempt.id, attempt.draftSavedAt)
  const { isSubmitting, submit } = useSubmitItem(interview.id, cancelPending)
  const answerRef = useRef(answer)
  answerRef.current = answer
  const hasAutoSubmitted = useRef(false)
  const now = useNow()
  const deadline = new Date(item.startedAt!).getTime() + interview.timeLimitMinutes * 60_000
  const remainingSeconds = Math.max(0, Math.ceil((deadline - now) / 1000))
  const isLast = index === interview.items.length - 1

  // Only one automatic try: a failure is shown once, and the submit button stays available.
  useEffect(() => {
    if (now < deadline || hasAutoSubmitted.current) return
    hasAutoSubmitted.current = true
    setIsConfirmOpen(false)
    void submit(answerRef.current, true)
  }, [now, deadline, submit])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key === 's') {
        event.preventDefault()
        void saveNow(answerRef.current)
      }
      if (event.key === 'Enter' && !isSubmitting) {
        event.preventDefault()
        setIsConfirmOpen(true)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [saveNow, isSubmitting])

  const changeAnswer = (nextAnswer: string): void => {
    setAnswer(nextAnswer)
    scheduleSave(nextAnswer)
  }
  const confirmSubmit = (): void => {
    setIsConfirmOpen(false)
    void submit(answer, false)
  }
  const isBlank = countCharacters(answer) === 0

  return (
    <div className="grid h-full grid-cols-2 divide-x divide-line">
      <div className="overflow-y-auto px-10 pb-10 pt-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold tracking-wide text-accent-ink">모의 면접 · 문제 {index + 1} / {interview.items.length}</p>
          <AbandonButton interviewId={interview.id} description={ABANDON_DESCRIPTION} />
        </div>
        <QuestionStatement question={question} />
      </div>
      <div className="flex min-h-0 flex-col px-8 pb-6 pt-2">
        <div className="mb-3 flex justify-end"><Countdown remainingSeconds={remainingSeconds} /></div>
        <EditorHeader mode={mode} onModeChange={setMode} answer={answer} question={question} />
        <AnswerEditor mode={mode} answer={answer} hasAnswer={!isBlank} isSubmitting={isSubmitting} onChange={changeAnswer} />
        <div className="mt-4 flex items-center justify-between text-xs text-ink-muted">
          <SaveIndicator state={saveState} />
          <Button isLoading={isSubmitting} onClick={() => setIsConfirmOpen(true)}>{isLast ? '제출하고 면접 마치기' : '제출하고 다음 문제로'}</Button>
        </div>
      </div>
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="답안을 제출할까요?"
        description={`제출하면 이 문제로 돌아올 수 없습니다. 남은 시간은 ${formatDuration(remainingSeconds)}입니다.${isBlank ? ' 답안이 비어 있어 0점으로 처리됩니다.' : ''}`}
        confirmLabel={isLast ? '제출하고 마치기' : '제출하고 다음으로'}
        onConfirm={confirmSubmit}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  )
}

function usedSeconds(item: TimedInterviewItemView, timeLimitMinutes: number): number {
  if (!item.startedAt || !item.submittedAt) return 0
  const elapsed = (new Date(item.submittedAt).getTime() - new Date(item.startedAt).getTime()) / 1000
  return Math.min(elapsed, timeLimitMinutes * 60)
}

function ItemResult({ interview, item, index }: TimedSolveProps) {
  const navigate = useNavigate()
  const attempt = item.attempt
  const score = attempt?.grading?.totalScore
  return (
    <li>
      <button
        className="card flex w-full items-center gap-4 p-5 text-left transition hover:border-accent/40 disabled:cursor-default disabled:hover:border-line"
        disabled={!attempt}
        onClick={() => attempt && navigate({ name: 'attempt', attemptId: attempt.id })}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-bold">{index + 1}</span>
        <div className="min-w-0 flex-1">
          {item.question && <QuestionBadges question={item.question} />}
          <p className="mt-2 truncate font-semibold">{item.question?.title ?? '삭제된 문제'}</p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
            {formatDuration(usedSeconds(item, interview.timeLimitMinutes))} / {interview.timeLimitMinutes}분 사용
            {item.timedOut && <Badge className="bg-warn-soft text-warn">시간 종료</Badge>}
          </p>
        </div>
        {attempt?.status === 'grading' && <span className="flex items-center gap-1.5 text-xs text-ink-muted"><Spinner size={12} /> 채점 중</span>}
        {attempt?.status === 'grading-failed' && <Badge className="bg-bad-soft text-bad">채점 실패</Badge>}
        {score !== undefined && <span className={`text-2xl font-bold tracking-tight ${scoreTone(score)}`}>{score}<span className="text-sm font-medium text-ink-faint">점</span></span>}
      </button>
    </li>
  )
}

function TimedResults({ interview }: { interview: TimedInterviewView }) {
  const navigate = useNavigate()
  const score = interviewScore(interview)
  const pendingCount = gradingCount(interview)
  const summary = [
    interview.status === 'abandoned' ? '중간에 그만둔 면접입니다. 제출한 문제만 결과에 남았습니다.' : null,
    pendingCount > 0 ? `${pendingCount}문제는 아직 채점 중입니다. 끝나면 이 화면에 바로 반영됩니다.` : null,
    '문제를 누르면 채점 결과와 모범 답안, 꼬리 질문을 볼 수 있습니다.',
  ].filter(Boolean)
  return (
    <>
      <section className="card mb-6 flex items-end gap-8 p-7">
        <div>
          <p className="text-xs font-semibold text-ink-muted">평균 점수</p>
          {score === null
            ? <p className="mt-1 text-5xl font-bold tracking-tight text-ink-faint">–</p>
            : <p className={`mt-1 text-5xl font-bold tracking-tight ${scoreTone(score)}`}>{score}<span className="text-xl font-medium text-ink-faint"> / 100</span></p>}
        </div>
        <div className="space-y-1 text-sm text-ink-muted">{summary.map((line) => <p key={line}>{line}</p>)}</div>
      </section>
      {interview.items.length === 0
        ? <EmptyState title="제출한 문제가 없습니다" description="그만두기 전에 제출한 문제가 없어 남은 결과가 없습니다." />
        : <ul className="space-y-2">{interview.items.map((item, index) => <ItemResult key={item.attemptId ?? index} interview={interview} item={item} index={index} />)}</ul>}
      <div className="mt-6 flex justify-end"><Button onClick={() => navigate({ name: 'interviews' })}>새 면접 보기</Button></div>
    </>
  )
}

export function TimedSessionView({ interview }: { interview: TimedInterviewView }) {
  const currentIndex = interview.items.findIndex((item) => !item.submittedAt)
  const current = currentIndex === -1 ? null : interview.items[currentIndex]
  const isSolving = interview.status === 'in-progress' && current?.startedAt && current.attempt?.status === 'draft' && current.question

  // The answer sheet needs the whole window, like the regular solve screen.
  if (isSolving) return <TimedSolve key={current.attemptId} interview={interview} item={current} index={currentIndex} />

  const isUnfinished = interview.status === 'preparing' || interview.status === 'preparation-failed' || interview.status === 'in-progress'
  return (
    <PageContainer wide={!isUnfinished}>
      <SessionHeader interview={interview} actions={isUnfinished ? <AbandonButton interviewId={interview.id} description={ABANDON_DESCRIPTION} /> : undefined} />
      {interview.status === 'preparing' && <PreparingPanel interview={interview} />}
      {interview.status === 'preparation-failed' && <PreparationFailedPanel interview={interview} />}
      {interview.status === 'in-progress' && currentIndex !== -1 && <ItemIntro interview={interview} index={currentIndex} />}
      {(interview.status === 'submitted' || interview.status === 'abandoned') && <TimedResults interview={interview} />}
    </PageContainer>
  )
}
