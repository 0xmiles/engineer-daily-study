import { useState } from 'react'
import type { QuestionFeedbackReason, QuestionRating } from '@shared/types'
import { FEEDBACK_REASONS } from '@shared/taxonomy'
import { api, errorMessage } from '../lib/api'
import { useToast } from './toast'
import { Button } from './controls'

/** Rating and reasons for one question; the next generated questions take this into account. */
export function QuestionFeedbackForm({ questionId }: { questionId: string }) {
  const [rating, setRating] = useState<QuestionRating | null>(null)
  const [reasons, setReasons] = useState<QuestionFeedbackReason[]>([])
  const [comment, setComment] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const showToast = useToast()

  const toggleReason = (reason: QuestionFeedbackReason): void =>
    setReasons((current) => (current.includes(reason) ? current.filter((value) => value !== reason) : [...current, reason]))

  const send = async (): Promise<void> => {
    if (!rating) return
    setIsSaving(true)
    try {
      await api.addQuestionFeedback({ questionId, rating, reasons, comment })
      setIsSent(true)
      showToast({ tone: 'success', title: '피드백을 저장했습니다', message: '다음 문제를 만들 때 반영합니다.' })
    } catch (reason) {
      showToast({ tone: 'error', title: '피드백을 저장하지 못했습니다', message: errorMessage(reason) })
    } finally {
      setIsSaving(false)
    }
  }

  if (isSent) return <p className="text-sm text-slate-500">피드백을 남겨 주셔서 감사합니다. 이후 출제에 반영됩니다.</p>
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['good', 'poor'] as const).map((value) => (
          <button key={value} onClick={() => setRating(value)} className={`rounded-lg border px-3 py-1.5 text-sm ${rating === value ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700'}`}>
            {value === 'good' ? '좋은 문제였어요' : '아쉬운 문제였어요'}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FEEDBACK_REASONS.map((reason) => (
          <button key={reason.value} onClick={() => toggleReason(reason.value)} className={`rounded-full border px-3 py-1 text-xs ${reasons.includes(reason.value) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
            {reason.label}
          </button>
        ))}
      </div>
      <textarea className="input h-20 resize-none" placeholder="예: 코드 리뷰 문제의 코드가 너무 짧았습니다. 상황 설명에 트래픽 수치가 더 있으면 좋겠습니다." value={comment} onChange={(event) => setComment(event.target.value)} />
      <Button variant="secondary" disabled={!rating} isLoading={isSaving} onClick={() => void send()}>피드백 남기기</Button>
    </div>
  )
}
