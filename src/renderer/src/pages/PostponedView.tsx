import type { Attempt, Question } from '@shared/types'
import { api, formatDate, formatDateTime } from '../lib/api'
import { useNavigate } from '../state/navigation'
import { useRequest } from '../state/useRequest'
import { Button } from '../components/controls'
import { HintList } from '../components/HintPanel'
import { Markdown } from '../components/Markdown'
import { PageContainer } from '../components/PageHeader'
import { QuestionStatement } from '../components/QuestionStatement'

function RetryNotice({ attempt }: { attempt: Attempt }) {
  const navigate = useNavigate()
  const request = useRequest()
  const solveAgain = async (): Promise<void> => {
    const attemptId = await request.run(() => api.startRetry(attempt.id), '다시 풀기를 시작하지 못했습니다')
    if (attemptId) navigate({ name: 'attempt', attemptId })
  }
  const schedule = attempt.retryAttemptId
    ? '이미 이 문제를 다시 풀기 시작했습니다.'
    : attempt.retryOn ? `${formatDate(attempt.retryOn)}에 오늘의 문제로 다시 나옵니다. 그 전에 지금 풀 수도 있습니다.` : '지금 다시 풀 수 있습니다.'
  return (
    <section className="card flex items-center justify-between gap-4 border-l-4 border-l-warn p-5">
      <div>
        <p className="font-semibold">나중에 다시 풀기로 미룬 문제입니다</p>
        <p className="mt-1 text-sm text-ink-muted">{schedule}</p>
      </div>
      <Button isLoading={request.isRunning} onClick={() => void solveAgain()}>{attempt.retryAttemptId ? '다시 푼 풀이 보기' : '지금 다시 풀기'}</Button>
    </section>
  )
}

/** A postponed attempt: the question, the hints it used and the unfinished draft, all read-only. */
export function PostponedView({ attempt, question }: { attempt: Attempt; question: Question }) {
  return (
    <PageContainer>
      <RetryNotice attempt={attempt} />
      <div className="card mt-4 p-6"><QuestionStatement question={question} /></div>
      {(attempt.hints ?? []).length > 0 && (
        <section className="card mt-4 p-5">
          <p className="mb-3 font-semibold">받은 힌트</p>
          <HintList hints={attempt.hints ?? []} />
        </section>
      )}
      <section className="card mt-4 p-5">
        <p className="font-semibold">미룰 때까지 쓴 답안</p>
        {attempt.postponedAt && <p className="mt-0.5 text-xs text-ink-faint">{formatDateTime(attempt.postponedAt)}에 미룸</p>}
        <div className="mt-3">{attempt.answer.trim() ? <Markdown text={attempt.answer} /> : <p className="text-sm text-ink-faint">작성한 내용이 없습니다.</p>}</div>
      </section>
    </PageContainer>
  )
}
