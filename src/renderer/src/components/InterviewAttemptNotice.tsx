import type { Attempt } from '@shared/types'
import { useNavigate } from '../state/navigation'
import { Button } from './controls'
import { EmptyState } from './feedback'
import { PageContainer } from './PageHeader'

/** Shown instead of the editor when an unfinished mock interview question is opened from elsewhere. */
export function InterviewAttemptNotice({ attempt }: { attempt: Attempt }) {
  const navigate = useNavigate()
  const interviewId = attempt.interviewId
  return (
    <PageContainer>
      <EmptyState
        title="모의 면접에서 풀고 있는 문제입니다"
        description="제한 시간이 면접 화면에서 흐르고 있어 여기서는 답안을 쓸 수 없습니다. 면접 화면으로 돌아가 이어서 푸세요."
        action={interviewId && <Button onClick={() => navigate({ name: 'interview', interviewId })}>면접으로 돌아가기</Button>}
      />
    </PageContainer>
  )
}
