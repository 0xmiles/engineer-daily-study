import { useEffect, useState } from 'react'
import type { InterviewMode } from '@shared/types'
import type { InterviewView, TimedInterviewView } from '@shared/api'
import { difficultyLabel } from '@shared/taxonomy'
import { useTopics } from '../state/topics'
import { Badge } from './QuestionBadges'

export const MODE_LABELS: Record<InterviewMode, string> = { timed: '제한 시간 세션', conversation: '대화형 면접' }

const DIFFICULTY_CLASSES = { junior: 'bg-good-soft text-good', middle: 'bg-info-soft text-info', senior: 'bg-plum-soft text-plum' }

const STATUS_BADGES: Record<string, { label: string; className?: string }> = {
  preparing: { label: '문제 준비 중', className: 'bg-info-soft text-info' },
  'preparation-failed': { label: '준비 실패', className: 'bg-bad-soft text-bad' },
  'in-progress': { label: '진행 중', className: 'bg-warn-soft text-warn' },
  grading: { label: '채점 중', className: 'bg-info-soft text-info' },
  reporting: { label: '평가 중', className: 'bg-info-soft text-info' },
  submitted: { label: '완료', className: 'bg-good-soft text-good' },
  completed: { label: '완료', className: 'bg-good-soft text-good' },
  abandoned: { label: '중단' },
}

export function scoreTone(score: number): string {
  if (score >= 80) return 'text-good'
  if (score >= 60) return 'text-info'
  return 'text-bad'
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  return minutes === 0 ? `${seconds}초` : `${minutes}분 ${String(seconds % 60).padStart(2, '0')}초`
}

/** The current time, refreshed every second while active; drives countdowns and elapsed-time labels. */
export function useNow(isActive = true): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!isActive) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isActive])
  return now
}

export function gradingCount(interview: TimedInterviewView): number {
  return interview.items.filter((item) => item.attempt?.status === 'grading').length
}

/** Average of the graded items of a timed session, or the report score of a conversation; null until there is one. */
export function interviewScore(interview: InterviewView): number | null {
  if (interview.mode === 'conversation') return interview.report?.overallScore ?? null
  const scores = interview.items.flatMap((item) => (item.attempt?.grading ? [item.attempt.grading.totalScore] : []))
  return scores.length === 0 ? null : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
}

/** A submitted session still shows as grading until every answer has its result. */
function displayStatus(interview: InterviewView): string {
  if (interview.mode === 'timed' && interview.status === 'submitted' && gradingCount(interview) > 0) return 'grading'
  return interview.status
}

export function InterviewBadges({ interview }: { interview: InterviewView }) {
  const { label: topicLabel } = useTopics()
  const status = STATUS_BADGES[displayStatus(interview)]
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge className="bg-accent-soft text-accent-ink">{MODE_LABELS[interview.mode]}</Badge>
      <Badge>{interview.topic ? topicLabel(interview.topic) : '주제 자동'}</Badge>
      <Badge className={DIFFICULTY_CLASSES[interview.difficulty]}>{difficultyLabel(interview.difficulty)}</Badge>
      {status && <Badge className={status.className}>{status.label}</Badge>}
    </div>
  )
}
