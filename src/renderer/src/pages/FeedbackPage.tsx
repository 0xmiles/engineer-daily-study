import { useState } from 'react'
import type { Feedback, FeedbackScope } from '@shared/types'
import { CATEGORIES, DIFFICULTIES, FEEDBACK_REASONS, FORMATS, TOPICS, categoryLabel, difficultyLabel, formatLabel, topicLabel } from '@shared/taxonomy'
import { api, errorMessage, formatDateTime } from '../lib/api'
import { useAsyncData } from '../state/useAsyncData'
import { useToast } from '../components/toast'
import { Button, Select } from '../components/controls'
import { EmptyState, ErrorPanel, SkeletonList } from '../components/feedback'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { Badge } from '../components/QuestionBadges'

function scopeText(scope: FeedbackScope): string {
  const parts = [
    scope.format && formatLabel(scope.format),
    scope.category && categoryLabel(scope.category),
    scope.topic && topicLabel(scope.topic),
    scope.difficulty && difficultyLabel(scope.difficulty),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '전체'
}

function describe(feedback: Feedback): string {
  if (feedback.kind === 'authoring') return feedback.comment
  const reasons = feedback.reasons.map((reason) => FEEDBACK_REASONS.find((entry) => entry.value === reason)?.label).join(', ')
  return [feedback.rating === 'good' ? '좋은 문제' : '아쉬운 문제', reasons, feedback.comment].filter(Boolean).join(' · ')
}

function AuthoringFeedbackForm() {
  const [comment, setComment] = useState('')
  const [scope, setScope] = useState<FeedbackScope>({})
  const [isSaving, setIsSaving] = useState(false)
  const showToast = useToast()
  const save = async (): Promise<void> => {
    setIsSaving(true)
    try {
      await api.addAuthoringFeedback({ comment, scope })
      setComment('')
      showToast({ tone: 'success', title: '출제 지침을 저장했습니다', message: '이후 생성되는 문제에 반영됩니다.' })
    } catch (reason) {
      showToast({ tone: 'error', title: '저장하지 못했습니다', message: errorMessage(reason) })
    } finally {
      setIsSaving(false)
    }
  }
  return (
    <section className="card space-y-4 p-6">
      <textarea className="input h-28" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="예: 시니어 문제는 조직·비용 제약을 더 넣어 주세요. 코드 리뷰 문제는 Kotlin 코드를 50줄 이상으로 주세요." />
      <div className="grid grid-cols-4 gap-3">
        <Select label="형식" value={scope.format ?? ''} options={FORMATS} allowEmpty="전체" onChange={(format) => setScope({ ...scope, format: format || undefined })} />
        <Select label="유형" value={scope.category ?? ''} options={CATEGORIES} allowEmpty="전체" onChange={(category) => setScope({ ...scope, category: category || undefined })} />
        <Select label="주제" value={scope.topic ?? ''} options={TOPICS} allowEmpty="전체" onChange={(topic) => setScope({ ...scope, topic: topic || undefined })} />
        <Select label="난이도" value={scope.difficulty ?? ''} options={DIFFICULTIES} allowEmpty="전체" onChange={(difficulty) => setScope({ ...scope, difficulty: difficulty || undefined })} />
      </div>
      <Button disabled={!comment.trim()} isLoading={isSaving} onClick={() => void save()}>출제 지침 저장</Button>
    </section>
  )
}

function FeedbackRow({ feedback }: { feedback: Feedback }) {
  const [isUpdating, setIsUpdating] = useState(false)
  const showToast = useToast()
  const toggle = async (): Promise<void> => {
    setIsUpdating(true)
    try {
      await api.setFeedbackActive(feedback.id, !feedback.active)
    } catch (reason) {
      showToast({ tone: 'error', title: '변경하지 못했습니다', message: errorMessage(reason) })
    } finally {
      setIsUpdating(false)
    }
  }
  return (
    <li className={`card flex items-start gap-4 p-4 ${feedback.active ? '' : 'opacity-60'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex gap-1.5">
          <Badge>{feedback.kind === 'authoring' ? '출제 방식' : '문제 평가'}</Badge>
          <Badge>적용 범위: {scopeText(feedback.scope)}</Badge>
        </div>
        <p className="mt-2 text-sm">{describe(feedback)}</p>
        <p className="mt-1 text-xs text-ink-faint">{formatDateTime(feedback.createdAt)}</p>
      </div>
      <Button variant="secondary" isLoading={isUpdating} onClick={() => void toggle()}>{feedback.active ? '반영 중지' : '다시 반영'}</Button>
    </li>
  )
}

export function FeedbackPage() {
  const { data: feedbacks, error, isLoading, reload } = useAsyncData(() => api.listFeedback(), [])
  return (
    <PageContainer>
      <PageHeader title="출제 피드백" description="출제 방식에 대한 의견을 남기면, 적용 범위가 맞는 최근 피드백 20개가 문제를 만들 때 출제 지침으로 반영됩니다." />
      <AuthoringFeedbackForm />
      <h2 className="mb-3 mt-10 text-sm font-semibold text-ink-muted">남긴 피드백</h2>
      {isLoading && <SkeletonList rows={2} />}
      {error && <ErrorPanel message={error} onRetry={reload} />}
      {feedbacks && feedbacks.length === 0 && <EmptyState title="아직 남긴 피드백이 없습니다" description="문제를 풀고 채점 결과 화면에서 문제 평가를 남기거나, 위에서 출제 방식 의견을 작성하세요." />}
      <ul className="space-y-2">{feedbacks?.map((feedback) => <FeedbackRow key={feedback.id} feedback={feedback} />)}</ul>
    </PageContainer>
  )
}
