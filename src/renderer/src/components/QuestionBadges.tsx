import type { Question } from '@shared/types'
import { SOURCE_LABELS, categoryLabel, difficultyLabel, formatLabel, topicLabel } from '@shared/taxonomy'

const DIFFICULTY_CLASSES = {
  junior: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  middle: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  senior: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
}

export function Badge({ children, className = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
}

type BadgeFields = Pick<Question, 'format' | 'category' | 'topic' | 'difficulty'> & Partial<Pick<Question, 'source' | 'reviewStatus'>>

export function QuestionBadges({ question, showSource = false }: { question: BadgeFields; showSource?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">{formatLabel(question.format)}</Badge>
      <Badge>{categoryLabel(question.category)}</Badge>
      <Badge>{topicLabel(question.topic)}</Badge>
      <Badge className={DIFFICULTY_CLASSES[question.difficulty]}>{difficultyLabel(question.difficulty)}</Badge>
      {showSource && question.source && <Badge>{SOURCE_LABELS[question.source]}</Badge>}
      {showSource && question.reviewStatus === 'unreviewed' && (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">검수 대기</Badge>
      )}
    </div>
  )
}
