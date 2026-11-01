import { api } from '../lib/api'
import { useAsyncData } from '../state/useAsyncData'
import { ErrorPanel, PageLoading } from '../components/feedback'
import { PageContainer } from '../components/PageHeader'
import { TimedSessionView } from './TimedSessionView'
import { ConversationSessionView } from './ConversationSessionView'

/** Routes a mock interview to the screen for its mode. */
export function InterviewSessionPage({ interviewId }: { interviewId: string }) {
  const { data: interview, error, isLoading, reload } = useAsyncData(() => api.getInterview(interviewId), [interviewId])

  if (isLoading) return <PageContainer><PageLoading /></PageContainer>
  if (error) return <PageContainer><ErrorPanel message={error} onRetry={reload} /></PageContainer>
  if (!interview) return <PageContainer><ErrorPanel message="면접을 찾을 수 없습니다." /></PageContainer>
  return interview.mode === 'timed' ? <TimedSessionView interview={interview} /> : <ConversationSessionView interview={interview} />
}
