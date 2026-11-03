import type { Attempt } from '@shared/types'
import { isShortAnswer } from '@shared/taxonomy'
import { api } from '../lib/api'
import { useAsyncData } from '../state/useAsyncData'
import { useRunningJob } from '../state/jobs'
import { useRequest } from '../state/useRequest'
import { ErrorPanel, PageLoading } from '../components/feedback'
import { JobProgressPanel } from '../components/JobProgress'
import { PageContainer } from '../components/PageHeader'
import { QuestionStatement } from '../components/QuestionStatement'
import { Button } from '../components/controls'
import { InterviewAttemptNotice } from '../components/InterviewAttemptNotice'
import { ShortAnswerSolveView } from './ShortAnswerSolveView'
import { SolveView } from './SolveView'
import { ResultView } from './ResultView'
import { PostponedView } from './PostponedView'

function GradingFailedPanel({ attempt, onReload }: { attempt: Attempt; onReload: () => void }) {
  const retryRequest = useRequest()
  const retry = (): void => void retryRequest.run(() => api.retryGrading(attempt.id), '다시 채점하지 못했습니다')
  return (
    <div className="space-y-3">
      <ErrorPanel message={attempt.gradingError ?? '채점에 실패했습니다.'} detail={attempt.gradingErrorDetail ?? null} onRetry={retry} isRetrying={retryRequest.isRunning} />
      <Button variant="secondary" onClick={onReload}>새로 고침</Button>
    </div>
  )
}

function useAttemptWithQuestion(attemptId: string) {
  return useAsyncData(async () => {
    const attempt = await api.getAttempt(attemptId)
    const question = attempt ? await api.getQuestion(attempt.questionId) : null
    return { attempt, question }
  }, [attemptId])
}

function GradingStatusPanel({ attempt, onReload }: { attempt: Attempt; onReload: () => void }) {
  const gradingJob = useRunningJob('grade-answer', attempt.id)
  const isGrading = attempt.status === 'grading'
  return (
    <>
      {isGrading && gradingJob && (
        <JobProgressPanel job={gradingJob} title="감독관이 답안을 채점하고 있습니다" hint="다른 화면으로 이동해도 채점은 계속됩니다. 끝나면 알림으로 알려 드립니다." />
      )}
      {isGrading && !gradingJob && <PageLoading label="채점 상태를 확인하는 중" />}
      {attempt.status === 'grading-failed' && <GradingFailedPanel attempt={attempt} onReload={onReload} />}
    </>
  )
}

/** Routes an attempt to the screen for its state: writing, grading, failed or graded. */
export function AttemptPage({ attemptId }: { attemptId: string }) {
  const { data, error, isLoading, reload } = useAttemptWithQuestion(attemptId)

  if (isLoading) return <PageContainer><PageLoading /></PageContainer>
  if (error) return <PageContainer><ErrorPanel message={error} onRetry={reload} /></PageContainer>
  const { attempt, question } = data!
  if (!attempt || !question) return <PageContainer><ErrorPanel message="풀이 또는 문제를 찾을 수 없습니다." /></PageContainer>

  // A mock interview question is answered on the interview screen, where its timer runs.
  if (attempt.status === 'draft' && attempt.origin === 'interview') return <InterviewAttemptNotice attempt={attempt} />
  if (attempt.status === 'draft' && isShortAnswer(question)) return <ShortAnswerSolveView attempt={attempt} question={question} />
  if (attempt.status === 'draft') return <SolveView attempt={attempt} question={question} />
  if (attempt.status === 'graded') return <ResultView attempt={attempt} question={question} />
  if (attempt.status === 'postponed') return <PostponedView attempt={attempt} question={question} />

  return (
    <PageContainer>
      <div className="mb-6"><QuestionStatement question={question} /></div>
      <GradingStatusPanel attempt={attempt} onReload={reload} />
    </PageContainer>
  )
}
