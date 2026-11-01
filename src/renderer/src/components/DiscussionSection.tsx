import type { Attempt, Question } from '@shared/types'
import { DiscussionFollowUps } from './DiscussionFollowUps'
import { DiscussionInquiries } from './DiscussionInquiries'

/** After grading: follow-up questions that dig into the weaknesses, and questions to the grader about the grading. */
export function DiscussionSection({ attempt, question: _question }: { attempt: Attempt; question: Question }) {
  return (
    <section className="card mt-8 p-6">
      <p className="text-lg font-bold tracking-tight">감독관과 더 이야기하기</p>
      <p className="mt-1 text-sm text-ink-muted">꼬리 질문에 답하며 부족한 부분을 더 파고들거나, 채점과 모범 답안에 대해 질문할 수 있습니다. 여기서 나눈 대화는 점수에 반영되지 않습니다.</p>
      <div className="mt-6 space-y-10">
        <DiscussionFollowUps attempt={attempt} />
        <DiscussionInquiries attempt={attempt} />
      </div>
    </section>
  )
}
