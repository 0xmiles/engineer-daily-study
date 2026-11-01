import type { Attempt, Inquiry } from '@shared/types'
import { api, formatDateTime } from '../lib/api'
import { useRunningJob } from '../state/jobs'
import { useRequest } from '../state/useRequest'
import { ErrorPanel, Spinner } from './feedback'
import { Markdown } from './Markdown'
import { SubmitTextarea } from './DiscussionTextarea'

function InquiryAnswer({ attemptId, inquiry }: { attemptId: string; inquiry: Inquiry }) {
  const retryRequest = useRequest()
  const job = useRunningJob('inquiry', attemptId)
  if (inquiry.answer !== null) {
    return (
      <div className="border-l-[3px] border-accent pl-4">
        <p className="label">감독관</p>
        <Markdown text={inquiry.answer} className="text-sm" />
      </div>
    )
  }
  if (inquiry.error) {
    const retry = (): void => void retryRequest.run(() => api.retryInquiry(attemptId, inquiry.id), '다시 요청하지 못했습니다')
    return <ErrorPanel message={`답을 받지 못했습니다. ${inquiry.error}`} onRetry={retry} isRetrying={retryRequest.isRunning} />
  }
  return (
    <p className="flex items-center gap-2 text-sm text-ink-muted">
      <Spinner size={14} className="text-accent" /> 감독관이 답을 쓰고 있습니다{job ? ` · ${job.stage}` : ''}
      {job && <button className="ml-auto text-xs hover:text-bad" onClick={() => void api.cancelJob(job.id)}>취소</button>}
    </p>
  )
}

/** One question at a time: the next one can be asked once the previous answer arrives or fails. */
export function DiscussionInquiries({ attempt }: { attempt: Attempt }) {
  const inquiries = attempt.inquiries ?? []
  const askRequest = useRequest()
  const isWaiting = inquiries.some((inquiry) => inquiry.answer === null && !inquiry.error)
  const ask = async (text: string): Promise<boolean> =>
    (await askRequest.run(() => api.askInquiry(attempt.id, text), '질문을 보내지 못했습니다')) !== undefined
  return (
    <div>
      <p className="font-semibold">감독관에게 질문하기</p>
      <p className="mt-0.5 text-xs text-ink-muted">채점 이유나 모범 답안의 내용을 물어볼 수 있습니다. 채점이 잘못됐다면 감독관이 인정하지만, 점수는 바뀌지 않습니다.</p>
      {inquiries.length > 0 && (
        <ol className="mt-4 space-y-5">
          {inquiries.map((inquiry) => (
            <li key={inquiry.id} className="space-y-3">
              <div className="rounded-xl bg-sunken px-4 py-3">
                <p className="mb-1 text-xs text-ink-faint">나 · {formatDateTime(inquiry.askedAt)}</p>
                <p className="whitespace-pre-wrap text-sm leading-6">{inquiry.question}</p>
              </div>
              <InquiryAnswer attemptId={attempt.id} inquiry={inquiry} />
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4">
        <SubmitTextarea
          placeholder={isWaiting ? '앞선 질문의 답을 기다리는 중입니다.' : '예: 2번 필수 항목이 왜 부분 충족인가요? 모범 답안에서 outbox를 쓰는 이유가 궁금합니다.'}
          submitLabel="질문하기"
          disabled={isWaiting}
          onSubmit={ask}
        />
      </div>
    </div>
  )
}
