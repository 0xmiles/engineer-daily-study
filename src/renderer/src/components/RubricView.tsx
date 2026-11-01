import type { Question, RubricItem, ScoredGrading } from '@shared/types'
import { Badge } from './QuestionBadges'

const COVERAGE_BADGES = {
  full: { label: '충족', className: 'bg-good-soft text-good' },
  partial: { label: '부분 충족', className: 'bg-warn-soft text-warn' },
  missing: { label: '누락', className: 'bg-bad-soft text-bad' },
}

function RubricList({ title, items, marked }: { title: string; items: RubricItem[]; marked?: string[] }) {
  if (items.length === 0) return null
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.point} className="text-sm">
            <span className="font-medium">{item.point}</span>
            {marked?.includes(item.point) && <Badge className="ml-2 bg-accent-soft text-accent-ink">해당</Badge>}
            <p className="mt-0.5 text-ink-muted">{item.explanation}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Rubric of a question; with a grading result, shows how the answer matched each item. */
export function RubricView({ question, grading }: { question: Question; grading?: ScoredGrading }) {
  return (
    <div className="card space-y-6 p-6">
      {grading ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">필수 항목 판정</h3>
          <ul className="space-y-3">
            {grading.requiredCoverage.map((item) => (
              <li key={item.point} className="text-sm">
                <span className="font-medium">{item.point}</span>
                <Badge className={`ml-2 ${COVERAGE_BADGES[item.status].className}`}>{COVERAGE_BADGES[item.status].label}</Badge>
                <p className="mt-0.5 text-ink-muted">{item.comment}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <RubricList title="필수 항목" items={question.rubric.required} />
      )}
      <RubricList title="가점 항목" items={question.rubric.bonus} marked={grading?.bonusMatched} />
      <RubricList title="감점 항목" items={question.rubric.deductions} marked={grading?.deductionsApplied} />
      <RubricList title="흔한 실수" items={question.rubric.commonMistakes} />
    </div>
  )
}
