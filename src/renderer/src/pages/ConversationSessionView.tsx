import { useState, type KeyboardEvent } from 'react'
import type { ConversationInterview, InterviewMessage, InterviewReport, JobKind } from '@shared/types'
import { api, formatDateTime } from '../lib/api'
import { useNavigate } from '../state/navigation'
import { useJobs } from '../state/jobs'
import { useRequest } from '../state/useRequest'
import { Button, ConfirmDialog } from '../components/controls'
import { ErrorPanel, Spinner } from '../components/feedback'
import { Markdown } from '../components/Markdown'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { InterviewBadges, MODE_LABELS, formatDuration, scoreTone, useNow } from '../components/InterviewShared'

const KIND_LABELS = { main: '본 질문', 'follow-up': '꼬리 질문', closing: '마무리' }

function countMainQuestions(messages: InterviewMessage[]): number {
  return messages.filter((message) => message.role === 'interviewer' && message.kind === 'main').length
}

/**
 * The newest job of the kind for this interview. A job that already succeeded counts as still waiting: its data
 * change may arrive a moment after the job list does, and a retry button must not flash in between.
 */
function useLatestJob(kind: JobKind, interviewId: string) {
  const job = useJobs().find((entry) => entry.kind === kind && entry.targetId === interviewId)
  return { job, isWaiting: job?.status === 'running' || job?.status === 'succeeded' }
}

function MessageBubble({ message, mainNumber, showAssessment }: { message: InterviewMessage; mainNumber: number; showAssessment: boolean }) {
  if (message.role === 'interviewer') {
    const kindLabel = message.kind === 'main' ? `${KIND_LABELS.main} ${mainNumber}` : message.kind ? KIND_LABELS[message.kind] : ''
    return (
      <li className="flex">
        <div className="card max-w-[80%] px-5 py-4">
          <p className="mb-1 text-xs font-semibold text-accent-ink">면접관{kindLabel && ` · ${kindLabel}`}</p>
          <Markdown text={message.text} />
        </div>
      </li>
    )
  }
  return (
    <li className="flex flex-col items-end">
      <div className="max-w-[80%] rounded-2xl bg-accent-soft px-5 py-4">
        <p className="mb-1 text-xs font-semibold text-accent-ink">내 답변</p>
        <p className="whitespace-pre-wrap text-[15px] leading-7">{message.text}</p>
      </div>
      {showAssessment && message.assessment && (
        <p className="mt-2 max-w-[80%] rounded-xl border border-line px-4 py-2.5 text-sm text-ink-muted">
          <span className="font-semibold text-ink">면접관 메모</span> {message.assessment}
        </p>
      )}
    </li>
  )
}

function Transcript({ messages, showAssessment }: { messages: InterviewMessage[]; showAssessment: boolean }) {
  let mainNumber = 0
  return (
    <ul className="space-y-4">
      {messages.map((message, index) => {
        if (message.role === 'interviewer' && message.kind === 'main') mainNumber++
        return <MessageBubble key={index} message={message} mainNumber={mainNumber} showAssessment={showAssessment} />
      })}
    </ul>
  )
}

function WaitingBubble({ startedAt, jobId, label }: { startedAt: string; jobId: string; label: string }) {
  const now = useNow()
  return (
    <div className="card flex items-center gap-3 px-5 py-4 text-sm text-ink-muted">
      <Spinner size={16} className="text-accent" />
      {label} · {formatDuration((now - new Date(startedAt).getTime()) / 1000)}
      <button className="ml-auto text-xs hover:text-bad" onClick={() => void api.cancelJob(jobId)}>취소</button>
    </div>
  )
}

function AnswerComposer({ interviewId }: { interviewId: string }) {
  const [answer, setAnswer] = useState('')
  const request = useRequest()
  const send = async (): Promise<void> => {
    if (!answer.trim() || request.isRunning) return
    const result = await request.run(async () => { await api.answerConversation(interviewId, answer); return true }, '답변을 보내지 못했습니다')
    if (result) setAnswer('')
  }
  const handleKey = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void send()
    }
  }
  return (
    <div className="card space-y-3 p-4">
      <textarea
        className="input h-32 resize-none text-[15px] leading-7"
        placeholder="면접관에게 말하듯 핵심부터 짧게 답하세요."
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        onKeyDown={handleKey}
        disabled={request.isRunning}
        autoFocus
      />
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>모르는 내용은 모른다고 답해도 됩니다. 면접관이 질문을 바꿔 이어 갑니다.</span>
        <Button isLoading={request.isRunning} disabled={!answer.trim()} onClick={() => void send()}>답변 보내기 (Cmd/Ctrl + Enter)</Button>
      </div>
    </div>
  )
}

/** The interviewer's reply never came: show the failed job's reason when it is still known and offer a retry. */
function MissingReply({ message, detail, hint, onRetry }: { message: string; detail: string | null; hint: string; onRetry: () => Promise<void> }) {
  const request = useRequest()
  return (
    <div className="space-y-3">
      <ErrorPanel message={message} detail={detail} onRetry={() => void request.run(onRetry, '다시 요청하지 못했습니다')} isRetrying={request.isRunning} />
      <p className="text-xs text-ink-muted">{hint}</p>
    </div>
  )
}

function failureMessage(status: string | undefined, error: string | null | undefined, fallback: string): string {
  if (status === 'cancelled') return '요청을 취소했습니다. 다시 시도하세요.'
  return error ?? fallback
}

function ConversationFooter({ interview }: { interview: ConversationInterview }) {
  const { job, isWaiting } = useLatestJob('interview-turn', interview.id)
  const last = interview.messages.at(-1)
  const isAwaitingAnswer = last?.role === 'interviewer' && last.kind !== 'closing'
  if (isAwaitingAnswer) return <AnswerComposer interviewId={interview.id} />
  if (isWaiting && job) {
    const label = interview.messages.length === 0 ? '면접관이 첫 질문을 준비하는 중' : '면접관이 답변을 듣고 다음 질문을 고르는 중'
    return <WaitingBubble startedAt={job.startedAt} jobId={job.id} label={label} />
  }
  return (
    <MissingReply
      message={failureMessage(job?.status, job?.error, '면접관의 응답을 받지 못했습니다. 다시 요청하세요.')}
      detail={job?.errorDetail ?? null}
      hint="계속 실패하면 위의 '면접 끝내기'로 지금까지의 답변만 평가받을 수 있습니다."
      onRetry={() => api.retryConversationTurn(interview.id)}
    />
  )
}

function ReportPending({ interview }: { interview: ConversationInterview }) {
  const { job, isWaiting } = useLatestJob('interview-report', interview.id)
  if (isWaiting && job) return <WaitingBubble startedAt={job.startedAt} jobId={job.id} label="면접관이 평가 보고서를 정리하는 중" />
  return (
    <MissingReply
      message={failureMessage(job?.status, job?.error, '평가 보고서를 받지 못했습니다. 다시 요청하세요.')}
      detail={job?.errorDetail ?? null}
      hint="계속 실패하면 위의 '평가 없이 중단'으로 대화 기록만 남길 수 있습니다."
      onRetry={() => api.retryInterviewReport(interview.id)}
    />
  )
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="card p-5">
      <p className="mb-3 font-semibold">{title}</p>
      {items.length === 0 ? <p className="text-sm text-ink-faint">없습니다.</p> : (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
      )}
    </section>
  )
}

function ReportView({ report }: { report: InterviewReport }) {
  return (
    <div className="space-y-4">
      <section className="card p-7">
        <p className={`text-5xl font-bold tracking-tight ${scoreTone(report.overallScore)}`}>{report.overallScore}<span className="text-xl font-medium text-ink-faint"> / 100</span></p>
        <p className="mt-5 text-[15px] leading-7">{report.summary}</p>
      </section>
      <section className="card p-5">
        <p className="mb-3 font-semibold">질문별 평가</p>
        <ol className="space-y-4">
          {report.questions.map((question, index) => (
            <li key={index} className="flex gap-4">
              <span className={`w-12 shrink-0 text-right text-lg font-bold ${scoreTone(question.score)}`}>{question.score}</span>
              <div>
                <p className="font-medium">{question.question}</p>
                <p className="mt-1 text-sm leading-6 text-ink-muted">{question.assessment}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <div className="grid grid-cols-2 gap-4">
        <ReportList title="잘한 점" items={report.strengths} />
        <ReportList title="보완할 점" items={report.weaknesses} />
      </div>
      <section className="card p-5">
        <p className="mb-3 font-semibold">추가 학습</p>
        <ul className="space-y-3">
          {report.studyRecommendations.map((item, index) => (
            <li key={index}>
              <p className="font-medium">{item.keyword}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{item.reason}</p>
              <p className="mt-1 text-xs text-ink-muted">검색어: <code>{item.searchQuery}</code></p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function FinishButton({ interview }: { interview: ConversationInterview }) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const request = useRequest()
  const hasAnswer = interview.messages.some((message) => message.role === 'candidate')
  const finish = (): void => {
    setIsConfirmOpen(false)
    void request.run(() => api.finishConversation(interview.id), '면접을 끝내지 못했습니다')
  }
  return (
    <>
      <Button variant="secondary" isLoading={request.isRunning} onClick={() => setIsConfirmOpen(true)}>면접 끝내기</Button>
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="면접을 끝낼까요?"
        description={hasAnswer ? '지금까지 답한 내용으로 평가 보고서를 만듭니다. 아직 답하지 않은 질문은 평가에서 빠집니다.' : '아직 답한 질문이 없어 면접을 중단합니다.'}
        confirmLabel="끝내기"
        onConfirm={finish}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </>
  )
}

function AbandonReportButton({ interviewId }: { interviewId: string }) {
  const request = useRequest()
  return <Button variant="ghost" isLoading={request.isRunning} onClick={() => void request.run(() => api.abandonInterview(interviewId), '면접을 중단하지 못했습니다')}>평가 없이 중단</Button>
}

function headerDescription(interview: ConversationInterview): string {
  const asked = countMainQuestions(interview.messages)
  const progress = interview.status === 'in-progress' ? `본 질문 ${asked}/${interview.mainQuestionCount}` : `본 질문 ${asked}개`
  return `${progress} · 꼬리 질문 최대 ${interview.maxFollowUps}개 · ${formatDateTime(interview.createdAt)} 시작`
}

export function ConversationSessionView({ interview }: { interview: ConversationInterview }) {
  const navigate = useNavigate()
  const actions = interview.status === 'in-progress'
    ? <FinishButton interview={interview} />
    : interview.status === 'reporting' ? <AbandonReportButton interviewId={interview.id} /> : <Button variant="secondary" onClick={() => navigate({ name: 'interviews' })}>새 면접 보기</Button>
  const isFinished = interview.status === 'completed' || interview.status === 'abandoned'
  return (
    <PageContainer>
      <PageHeader title={MODE_LABELS.conversation} description={headerDescription(interview)} actions={actions} />
      <div className="-mt-5 mb-6"><InterviewBadges interview={interview} /></div>
      {interview.status === 'completed' && interview.report && (
        <>
          <ReportView report={interview.report} />
          <h2 className="mb-3 mt-10 text-sm font-semibold text-ink-muted">면접 기록</h2>
        </>
      )}
      {interview.status === 'abandoned' && <p className="mb-6 text-sm text-ink-muted">중단한 면접입니다. 평가 보고서 없이 대화 기록만 남았습니다.</p>}
      <Transcript messages={interview.messages} showAssessment={isFinished} />
      <div className="mt-6">
        {interview.status === 'in-progress' && <ConversationFooter interview={interview} />}
        {interview.status === 'reporting' && <ReportPending interview={interview} />}
      </div>
    </PageContainer>
  )
}
