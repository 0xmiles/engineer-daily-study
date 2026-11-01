import type { GradingResult } from '@shared/types'
import { useNavigate } from '../state/navigation'

type StudyRecommendation = GradingResult['studyRecommendations'][number]

/** Recommendations from a grading or interview report; each opens its study note, where the material is written. */
export function StudyRecommendationList({ items }: { items: StudyRecommendation[] }) {
  const navigate = useNavigate()
  const recommendations = items.filter((item) => item.keyword.trim())
  if (recommendations.length === 0) return <p className="text-sm text-ink-faint">추천된 추가 학습 주제가 없습니다.</p>
  return (
    <div>
      <p className="mb-3 text-xs text-ink-muted">키워드를 누르면 학습 노트에서 정리된 설명을 읽고, 스스로 점검하고, 메모를 남길 수 있습니다.</p>
      <ul className="space-y-3">
        {recommendations.map((item, index) => (
          <li key={index}>
            <button
              className="card group flex w-full items-center gap-4 p-4 text-left transition-colors hover:border-accent/40"
              onClick={() => navigate({ name: 'studyNote', keyword: item.keyword })}
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold group-hover:text-accent-ink">{item.keyword}</p>
                <p className="mt-1 text-sm text-ink-muted">{item.reason}</p>
              </div>
              <span className="shrink-0 text-sm font-medium text-accent-ink">공부하기 →</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
