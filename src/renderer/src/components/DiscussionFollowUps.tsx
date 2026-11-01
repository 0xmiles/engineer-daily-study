import type { Attempt, FollowUp, FollowUpVerdict } from '@shared/types'
import { MAX_FOLLOW_UPS } from '@shared/rules'
import { api } from '../lib/api'
import { useRunningJob } from '../state/jobs'
import { useRequest } from '../state/useRequest'
import { Button } from './controls'
import { ErrorPanel, Spinner } from './feedback'
import { Markdown } from './Markdown'
import { Badge } from './QuestionBadges'
import { SubmitTextarea } from './DiscussionTextarea'

const VERDICT_BADGES: Record<FollowUpVerdict, { label: string; className: string }> = {
  good: { label: '잘 답했습니다', className: 'bg-good-soft text-good' },
  partial: { label: '부분적으로 답했습니다', className: 'bg-warn-soft text-warn' },
  insufficient: { label: '보완이 필요합니다', className: 'bg-bad-soft text-bad' },
}

function FollowUpEvaluationView({ attemptId, followUp }: { attemptId: string; followUp: FollowUp }) {
  const retryRequest = useRequest()
  if (followUp.evaluation) {
    const badge = VERDICT_BADGES[followUp.evaluation.verdict]
    return (
      <div className="mt-4 space-y-3">
        <Badge className={badge.className}>{badge.label}</Badge>
        <Markdown text={followUp.evaluation.comment} className="text-sm" />
        <details className="rounded-xl bg-sunken px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">모범 답 보기</summary>
          <div className="mt-3"><Markdown text={followUp.evaluation.modelAnswer} className="text-sm" /></div>
        </details>
      </div>
    )
  }
  if (followUp.evaluationError) {
    const retry = (): void => void retryRequest.run(() => api.retryFollowUpEvaluation(attemptId, followUp.id), '다시 평가하지 못했습니다')
    return <div className="mt-4"><ErrorPanel message={`답을 평가하지 못했습니다. ${followUp.evaluationError}`} onRetry={retry} isRetrying={retryRequest.isRunning} /></div>
  }
  return <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted"><Spinner size={14} className="text-accent" /> 감독관이 답을 평가하고 있습니다</p>
}

function FollowUpCard({ attemptId, followUp, number }: { attemptId: string; followUp: FollowUp; number: number }) {
  const answerRequest = useRequest()
  const answer = async (text: string): Promise<boolean> =>
    (await answerRequest.run(() => api.answerFollowUp(attemptId, followUp.id, text), '답을 보내지 못했습니다')) !== undefined
  return (
    <li className="rounded-2xl border border-line p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-wide text-accent-ink">꼬리 질문 {number}</span>
        {followUp.focus && <Badge>{followUp.focus}</Badge>}
      </div>
      <Markdown text={followUp.question} className="mt-2" />
      {followUp.answer === null ? (
        <div className="mt-4">
          <SubmitTextarea placeholder="3~5문장으로 답해 보세요. 마크다운을 쓸 수 있습니다." submitLabel="답하기" onSubmit={answer} />
        </div>
      ) : (
        <>
          <div className="mt-4 border-l-[3px] border-line-strong pl-4">
            <p className="label">내 답</p>
            <Markdown text={followUp.answer} className="text-sm" />
          </div>
          <FollowUpEvaluationView attemptId={attemptId} followUp={followUp} />
        </>
      )}
    </li>
  )
}

function RequestFollowUps({ attempt }: { attempt: Attempt }) {
  const job = useRunningJob('follow-up-questions', attempt.id)
  const request = useRequest()
  const followUps = attempt.followUps ?? []
  if (job) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Spinner size={14} className="text-accent" /> 꼬리 질문을 만드는 중 · {job.stage}
        <button className="ml-auto text-xs hover:text-bad" onClick={() => void api.cancelJob(job.id)}>취소</button>
      </div>
    )
  }
  if (followUps.length >= MAX_FOLLOW_UPS) return <p className="text-sm text-ink-muted">꼬리 질문을 모두 받았습니다.</p>
  if (followUps.some((followUp) => followUp.evaluation === null)) return null
  return (
    <Button variant="secondary" isLoading={request.isRunning} onClick={() => void request.run(() => api.requestFollowUps(attempt.id), '꼬리 질문을 요청하지 못했습니다')}>
      {followUps.length === 0 ? '꼬리 질문 받기' : '더 깊이 묻는 꼬리 질문 받기'}
    </Button>
  )
}

/** Rounds of up to two questions; the next round opens once every earlier answer has been evaluated. */
export function DiscussionFollowUps({ attempt }: { attempt: Attempt }) {
  const followUps = attempt.followUps ?? []
  return (
    <div>
      <p className="font-semibold">꼬리 질문</p>
      <p className="mt-0.5 text-xs text-ink-muted">면접관처럼 답안의 약점을 이어서 묻습니다. 최대 {MAX_FOLLOW_UPS}개까지 받을 수 있습니다.</p>
      {followUps.length > 0 && (
        <ol className="mt-4 space-y-3">
          {followUps.map((followUp, index) => <FollowUpCard key={followUp.id} attemptId={attempt.id} followUp={followUp} number={index + 1} />)}
        </ol>
      )}
      <div className="mt-4"><RequestFollowUps attempt={attempt} /></div>
    </div>
  )
}
