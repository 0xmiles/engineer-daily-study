import type { StreakView, StudyDay } from '@shared/api'
import { api } from '../lib/api'
import { useAsyncData } from '../state/useAsyncData'
import { Skeleton } from './feedback'

const DAYS_PER_WEEK = 7
const INTENSITY_CLASSES = ['bg-sunken', 'bg-accent/30', 'bg-accent/55', 'bg-accent/80', 'bg-accent']

function intensityClass(count: number): string {
  return INTENSITY_CLASSES[Math.min(count, INTENSITY_CLASSES.length - 1)]
}

function dayTitle({ date, count }: StudyDay): string {
  const [, month, day] = date.split('-').map(Number)
  return `${month}월 ${day}일 · ${count > 0 ? `${count}개` : '기록 없음'}`
}

/** Weeks as columns starting on Sunday, so the first column is padded up to the first day's weekday. */
function weekColumns(days: StudyDay[]): (StudyDay | null)[][] {
  if (days.length === 0) return []
  const [year, month, day] = days[0].date.split('-').map(Number)
  const padding: null[] = Array(new Date(year, month - 1, day).getDay()).fill(null)
  const cells = [...padding, ...days]
  return Array.from({ length: Math.ceil(cells.length / DAYS_PER_WEEK) }, (_, week) => cells.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK))
}

function Heatmap({ days }: { days: StudyDay[] }) {
  const studiedDays = days.filter((day) => day.count > 0).length
  return (
    <div>
      <div className="flex gap-[3px]" role="img" aria-label={`최근 ${days.length}일 중 ${studiedDays}일 공부함`}>
        {weekColumns(days).map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col gap-[3px]">
            {week.map((day, dayIndex) => day
              ? <div key={day.date} title={dayTitle(day)} className={`h-2.5 w-2.5 rounded-[3px] ${intensityClass(day.count)}`} />
              : <div key={`empty-${dayIndex}`} className="h-2.5 w-2.5" />)}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-faint">
        <span>최근 {Math.round(days.length / DAYS_PER_WEEK)}주</span>
        <span className="flex items-center gap-[3px]">
          적음
          {INTENSITY_CLASSES.map((className) => <span key={className} className={`h-2.5 w-2.5 rounded-[3px] ${className}`} />)}
          많음
        </span>
      </div>
    </div>
  )
}

function StreakSummary({ streak }: { streak: StreakView }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold tracking-wide text-accent-ink">연속 학습</p>
      <p className="mt-1 text-4xl font-bold tracking-tight">{streak.current}<span className="ml-0.5 text-base font-medium text-ink-faint">일</span></p>
      <p className="mt-1 text-xs text-ink-muted">최장 {streak.longest}일</p>
      <p className={`mt-3 text-sm font-medium ${streak.studiedToday ? 'text-good' : 'text-ink-muted'}`}>
        {streak.studiedToday ? '오늘 공부 완료' : '아직 오늘 문제를 풀지 않았습니다'}
      </p>
    </div>
  )
}

/** Consecutive study days and an activity heatmap; any submitted answer or finished interview counts for its day. */
export function StreakCard() {
  const { data: streak, isLoading } = useAsyncData(() => api.getStreak(), [])
  if (isLoading) return <div className="card mb-6 p-6"><Skeleton className="h-24 w-full" /></div>
  // The streak is encouragement, not data the page needs, so a failure just leaves it out.
  if (!streak) return null
  return (
    <section className="card mb-6 flex items-center gap-8 p-6">
      <StreakSummary streak={streak} />
      <Heatmap days={streak.days} />
    </section>
  )
}
