import { describe, expect, it } from 'vitest'
import type { Attempt, Interview } from '@shared/types'
import { computeStreak, studyActivityDates } from './streak'

const TODAY = '2026-11-01'

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    const streak = computeStreak(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-01'], TODAY)
    expect(streak).toMatchObject({ current: 3, longest: 3, studiedToday: true })
  })

  it('keeps yesterday\'s streak alive while today has no activity yet', () => {
    expect(computeStreak(['2026-10-30', '2026-10-31'], TODAY)).toMatchObject({ current: 2, studiedToday: false })
  })

  it('resets the current streak after a missed day but remembers the longest run', () => {
    const streak = computeStreak(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-30'], TODAY)
    expect(streak).toMatchObject({ current: 0, longest: 4 })
  })

  it('counts runs across month ends', () => {
    expect(computeStreak(['2026-09-30', '2026-10-01'], '2026-10-01').current).toBe(2)
  })

  it('fills the heatmap with every day up to today, oldest first', () => {
    const { days } = computeStreak(['2026-11-01', '2026-11-01', '2026-10-29'], TODAY, 4)
    expect(days).toEqual([
      { date: '2026-10-29', count: 1 },
      { date: '2026-10-30', count: 0 },
      { date: '2026-10-31', count: 0 },
      { date: '2026-11-01', count: 2 },
    ])
  })
})

describe('studyActivityDates', () => {
  it('counts submitted attempts and completed conversation interviews only', () => {
    const at = (day: string) => new Date(2026, 9, Number(day), 12).toISOString()
    const attempts = [
      { status: 'graded', submittedAt: at('30') },
      { status: 'grading-failed', submittedAt: at('31') },
      { status: 'draft', submittedAt: null },
      { status: 'postponed', submittedAt: null },
    ] as Attempt[]
    const interviews = [
      { mode: 'conversation', status: 'completed', completedAt: at('29') },
      { mode: 'conversation', status: 'in-progress', completedAt: null },
    ] as Interview[]
    expect(studyActivityDates(attempts, interviews).sort()).toEqual(['2026-10-29', '2026-10-30', '2026-10-31'])
  })
})
