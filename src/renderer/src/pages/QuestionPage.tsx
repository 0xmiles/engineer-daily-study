import { useState } from 'react'
import { api, errorMessage, formatDateTime } from '../lib/api'
import { useAsyncData } from '../state/useAsyncData'
import { useNavigate } from '../state/navigation'
import { useToast } from '../components/toast'
import { Button, ConfirmDialog } from '../components/controls'
import { ErrorPanel, PageLoading } from '../components/feedback'
import { Markdown } from '../components/Markdown'
import { PageContainer } from '../components/PageHeader'
import { QuestionStatement } from '../components/QuestionStatement'
import { QuestionFeedbackForm } from '../components/QuestionFeedbackForm'
import { RubricView } from '../components/RubricView'

/** Bank detail: statement first, rubric and model answer folded so browsing the bank does not spoil questions. */
export function QuestionPage({ questionId }: { questionId: string }) {
  const { data: question, error, isLoading, reload } = useAsyncData(() => api.getQuestion(questionId), [questionId])
  const [pendingAction, setPendingAction] = useState<'solve' | 'review' | 'delete' | null>(null)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const navigate = useNavigate()
  const showToast = useToast()

  const run = async (action: 'solve' | 'review' | 'delete', work: () => Promise<void>): Promise<void> => {
    setPendingAction(action)
    try {
      await work()
    } catch (reason) {
      showToast({ tone: 'error', title: '요청을 처리하지 못했습니다', message: errorMessage(reason) })
    } finally {
      setPendingAction(null)
    }
  }

  if (isLoading) return <PageContainer><PageLoading /></PageContainer>
  if (error) return <PageContainer><ErrorPanel message={error} onRetry={reload} /></PageContainer>
  if (!question) return <PageContainer><ErrorPanel message="문제를 찾을 수 없습니다." /></PageContainer>

  const isReviewed = question.reviewStatus === 'reviewed'
  return (
    <PageContainer>
      <div className="mb-4 flex justify-between">
        <Button variant="ghost" onClick={() => navigate({ name: 'bank' })}>← 문제 은행</Button>
        <div className="flex gap-2">
          <Button variant="secondary" isLoading={pendingAction === 'review'} onClick={() => void run('review', () => api.setReviewStatus(question.id, isReviewed ? 'unreviewed' : 'reviewed'))}>
            {isReviewed ? '검수 취소' : '검수 완료로 표시'}
          </Button>
          <Button variant="danger" isLoading={pendingAction === 'delete'} onClick={() => setIsDeleteConfirmOpen(true)}>삭제</Button>
          <Button isLoading={pendingAction === 'solve'} onClick={() => void run('solve', async () => navigate({ name: 'attempt', attemptId: await api.startAttempt(question.id, 'practice') }))}>이 문제 풀기</Button>
        </div>
      </div>
      <div className="card p-6">
        <QuestionStatement question={question} showSource />
        <p className="mt-4 text-xs text-slate-400">만든 시각 {formatDateTime(question.createdAt)}{question.servedAt ? ` · 출제 ${formatDateTime(question.servedAt)}` : ''}</p>
      </div>
      <details className="card mt-4 p-5">
        <summary className="cursor-pointer font-semibold">채점 기준 보기 (스포일러 주의)</summary>
        <div className="mt-4"><RubricView question={question} /></div>
      </details>
      <details className="card mt-4 p-5">
        <summary className="cursor-pointer font-semibold">모범 답안 보기 (스포일러 주의)</summary>
        <div className="mt-4"><Markdown text={question.modelAnswer} /></div>
      </details>
      <section className="card mt-4 p-5">
        <p className="mb-3 font-semibold">문제 품질 피드백</p>
        <QuestionFeedbackForm questionId={question.id} />
      </section>
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="문제를 삭제할까요?"
        description="삭제한 문제는 되돌릴 수 없습니다. 풀이 기록이 있는 문제는 삭제할 수 없습니다."
        confirmLabel="삭제"
        tone="danger"
        onCancel={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => { setIsDeleteConfirmOpen(false); void run('delete', async () => { await api.deleteQuestion(question.id); navigate({ name: 'bank' }) }) }}
      />
    </PageContainer>
  )
}
