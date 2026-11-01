import { describe, expect, it } from 'vitest'
import type { Attempt, Question, QuestionCategory, QuestionFormat, Topic } from '@shared/types'
import { TOPICS } from '@shared/taxonomy'
import { findDueRetryAttempt, findDueWeaknessAttempt, pickUnservedQuestion, planDailySet, type SelectionContext } from './selection'

function question(id: string, format: QuestionFormat, category: QuestionCategory, topic: Topic, extra: Partial<Question> = {}): Question {
  return { id, format, category, topic, difficulty: 'middle', title: id, keyIssues: [], reviewStatus: 'reviewed', ...extra } as Question
}

const ALL_TOPICS = TOPICS.map((topic) => topic.value)

function context(questions: Question[], attempts: Attempt[] = [], poorlyRated: string[] = [], topics: Topic[] = ALL_TOPICS): SelectionContext {
  return { questions, attempts, poorlyRatedQuestionIds: new Set(poorlyRated), topics }
}

function postponedAttempt(id: string, questionId: string, retryOn: string, retryAttemptId: string | null = null): Attempt {
  return { id, questionId, date: '2026-10-28', status: 'postponed', retryOn, retryAttemptId, weaknessFollowUps: 0 } as Attempt
}

function gradedAttempt(date: string, totalScore: number, weaknessFollowUps = 0): Attempt {
  return { id: `a-${date}`, questionId: 'q', date, status: 'graded', grading: { totalScore }, weaknessFollowUps } as Attempt
}

// 2026-11-02 is a Monday, so the scenario category is incident-diagnosis.
const MONDAY = '2026-11-02'

describe('pickUnservedQuestion', () => {
  it('never returns a question that was already served', () => {
    const served = question('served', 'concept', 'why', 'kafka', { servedAt: '2026-10-01T00:00:00Z' })
    expect(pickUnservedQuestion(context([served]), { format: 'concept', difficulty: 'middle' })).toBeNull()
  })

  it('prefers questions the user did not rate poorly', () => {
    const poor = question('poor', 'concept', 'why', 'kafka')
    const fine = question('fine', 'concept', 'why', 'kafka')
    expect(pickUnservedQuestion(context([poor, fine], [], ['poor']), { format: 'concept', difficulty: 'middle' })?.id).toBe('fine')
  })

  it('skips disabled topics unless the spec names the topic', () => {
    const kafka = question('kafka', 'concept', 'why', 'kafka')
    const withoutKafka = context([kafka], [], [], ['cache'])
    expect(pickUnservedQuestion(withoutKafka, { format: 'concept', difficulty: 'middle' })).toBeNull()
    expect(pickUnservedQuestion(withoutKafka, { format: 'concept', difficulty: 'middle', topic: 'kafka' })?.id).toBe('kafka')
  })
})

describe('planDailySet', () => {
  it('uses the weekday scenario category and a different topic for the concept question', () => {
    const questions = [
      question('scenario', 'scenario', 'incident-diagnosis', 'kafka'),
      question('concept-same-topic', 'concept', 'why', 'kafka'),
      question('concept-other-topic', 'concept', 'why', 'cache'),
    ]
    const plan = planDailySet(context(questions), { date: MONDAY, difficulty: 'middle', dailyCount: 2 })
    expect(plan.items.map((item) => item.questionId)).toEqual(['scenario', 'concept-other-topic'])
  })

  it('repeats the only enabled topic instead of picking a disabled one', () => {
    const questions = [question('scenario', 'scenario', 'incident-diagnosis', 'custom-redis'), question('concept', 'concept', 'why', 'custom-redis')]
    const plan = planDailySet(context(questions, [], [], ['custom-redis']), { date: MONDAY, difficulty: 'middle', dailyCount: 2 })
    expect(plan.items.map((item) => item.questionId)).toEqual(['scenario', 'concept'])
  })

  it('adds a due postponed question on top of the usual items', () => {
    const postponedQuestion = question('postponed', 'scenario', 'code-review', 'kafka', { servedAt: '2026-10-28T00:00:00Z' })
    const plan = planDailySet(context([postponedQuestion], [postponedAttempt('a-old', 'postponed', MONDAY)]), { date: MONDAY, difficulty: 'middle', dailyCount: 2 })
    expect(plan.items).toHaveLength(3)
    expect(plan.items[2]).toMatchObject({ kind: 'retry', questionId: 'postponed', retryOfAttemptId: 'a-old' })
  })

  it('leaves a concrete spec for generation when the bank has no match', () => {
    const plan = planDailySet(context([]), { date: MONDAY, difficulty: 'senior', dailyCount: 2 })
    expect(plan.items[0]).toMatchObject({ questionId: null, spec: { format: 'scenario', category: 'incident-diagnosis', difficulty: 'senior' } })
    expect(plan.items[0].spec.topic).toBeDefined()
    expect(plan.items[1].spec.topic).not.toBe(plan.items[0].spec.topic)
  })
})

describe('findDueRetryAttempt', () => {
  it('returns a postponed attempt from its retry day until it is solved again', () => {
    expect(findDueRetryAttempt([postponedAttempt('a', 'q', '2026-11-02')], '2026-11-01')).toBeNull()
    expect(findDueRetryAttempt([postponedAttempt('a', 'q', '2026-11-02')], '2026-11-02')?.id).toBe('a')
    expect(findDueRetryAttempt([postponedAttempt('a', 'q', '2026-10-30')], '2026-11-02')?.id).toBe('a')
    expect(findDueRetryAttempt([postponedAttempt('a', 'q', '2026-10-30', 'a-retry')], '2026-11-02')).toBeNull()
  })

  it('brings back the earliest due attempt first', () => {
    const attempts = [postponedAttempt('later', 'q1', '2026-11-01'), postponedAttempt('earlier', 'q2', '2026-10-30')]
    expect(findDueRetryAttempt(attempts, '2026-11-02')?.id).toBe('earlier')
  })
})

describe('findDueWeaknessAttempt', () => {
  it('schedules the first follow-up 3 days later and the second 7 days later', () => {
    expect(findDueWeaknessAttempt([gradedAttempt('2026-10-30', 40)], '2026-11-01')).toBeNull()
    expect(findDueWeaknessAttempt([gradedAttempt('2026-10-29', 40)], '2026-11-01')).not.toBeNull()
    expect(findDueWeaknessAttempt([gradedAttempt('2026-10-29', 40, 1)], '2026-11-01')).toBeNull()
    expect(findDueWeaknessAttempt([gradedAttempt('2026-10-25', 40, 1)], '2026-11-01')).not.toBeNull()
    expect(findDueWeaknessAttempt([gradedAttempt('2026-10-01', 40, 2)], '2026-11-01')).toBeNull()
  })

  it('ignores attempts that scored 60 or more', () => {
    expect(findDueWeaknessAttempt([gradedAttempt('2026-10-01', 60)], '2026-11-01')).toBeNull()
  })
})
