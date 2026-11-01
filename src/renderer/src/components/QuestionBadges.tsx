import type { Question } from '@shared/types'
import { SOURCE_LABELS, categoryLabel, difficultyLabel, formatLabel } from '@shared/taxonomy'
import { useTopics } from '../state/topics'

const DIFFICULTY_CLASSES = {
  junior: 'bg-good-soft text-good',
  middle: 'bg-info-soft text-info',
  senior: 'bg-plum-soft text-plum',
}

export function Badge({ children, className = 'bg-sunken text-ink-muted' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>{children}</span>
}

type BadgeFields = Pick<Question, 'format' | 'category' | 'topic' | 'difficulty'> & Partial<Pick<Question, 'source' | 'reviewStatus'>>

export function QuestionBadges({ question, showSource = false }: { question: BadgeFields; showSource?: boolean }) {
  const { label: topicLabel } = useTopics()
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge className="bg-accent-soft text-accent-ink">{formatLabel(question.format)}</Badge>
      <Badge>{categoryLabel(question.category)}</Badge>
      <Badge>{topicLabel(question.topic)}</Badge>
      <Badge className={DIFFICULTY_CLASSES[question.difficulty]}>{difficultyLabel(question.difficulty)}</Badge>
      {showSource && question.source && <Badge>{SOURCE_LABELS[question.source]}</Badge>}
      {showSource && question.reviewStatus === 'unreviewed' && (
        <Badge className="bg-warn-soft text-warn">검수 대기</Badge>
      )}
    </div>
  )
}
