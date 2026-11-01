import { describe, expect, it } from 'vitest'
import type { InterviewMessage, QuestionContent } from '@shared/types'
import {
  allowedTurnActions,
  blankAnswerGrading,
  isLateSubmission,
  planTimedFormats,
  resolveTurnAction,
  validateConversationOptions,
  validateTimedOptions,
} from './interviews'

const at = '2026-11-01T00:00:00.000Z'

function interviewer(kind: 'main' | 'follow-up'): InterviewMessage {
  return { role: 'interviewer', text: '질문', at, kind }
}

const candidate: InterviewMessage = { role: 'candidate', text: '답변', at }

describe('planTimedFormats', () => {
  it('alternates formats for a mixed session, starting with a scenario', () => {
    expect(planTimedFormats('mixed', 3)).toEqual(['scenario', 'concept', 'scenario'])
    expect(planTimedFormats('concept', 2)).toEqual(['concept', 'concept'])
  })
})

describe('validateTimedOptions', () => {
  it('rejects counts and time limits outside the allowed range', () => {
    const valid = { difficulty: 'middle', format: 'mixed', questionCount: 3, timeLimitMinutes: 15 } as const
    expect(() => validateTimedOptions(valid)).not.toThrow()
    expect(() => validateTimedOptions({ ...valid, questionCount: 6 })).toThrow('문제 수')
    expect(() => validateTimedOptions({ ...valid, timeLimitMinutes: 2 })).toThrow('제한 시간')
    expect(() => validateTimedOptions({ ...valid, questionCount: 2.5 })).toThrow('문제 수')
  })
})

describe('validateConversationOptions', () => {
  it('rejects follow-up counts outside the allowed range', () => {
    expect(() => validateConversationOptions({ difficulty: 'senior', mainQuestionCount: 3, maxFollowUps: 4 })).toThrow('꼬리 질문')
  })
})

describe('isLateSubmission', () => {
  it('allows a few seconds for the automatic submission to arrive', () => {
    expect(isLateSubmission(at, 10, new Date(Date.parse(at) + 10 * 60_000 + 3_000))).toBe(false)
    expect(isLateSubmission(at, 10, new Date(Date.parse(at) + 11 * 60_000))).toBe(true)
  })
})

describe('allowedTurnActions', () => {
  const limits = { mainQuestionCount: 2, maxFollowUps: 1 }

  it('opens with a main question', () => {
    expect(allowedTurnActions({ ...limits, messages: [] })).toEqual(['main-question'])
  })

  it('offers a follow-up until the limit for the current question, then only the next question', () => {
    expect(allowedTurnActions({ ...limits, messages: [interviewer('main'), candidate] })).toEqual(['follow-up', 'main-question'])
    expect(allowedTurnActions({ ...limits, messages: [interviewer('main'), candidate, interviewer('follow-up'), candidate] })).toEqual(['main-question'])
  })

  it('offers finishing once every main question was asked, and resets the follow-up count per question', () => {
    const messages = [interviewer('main'), candidate, interviewer('follow-up'), candidate, interviewer('main'), candidate]
    expect(allowedTurnActions({ ...limits, messages })).toEqual(['follow-up', 'finish'])
  })
})

describe('resolveTurnAction', () => {
  it('keeps an allowed action', () => {
    expect(resolveTurnAction(['follow-up', 'main-question'], 'follow-up')).toEqual({ action: 'follow-up', useClosingMessage: false })
  })

  it('uses a disallowed follow-up as the next main question', () => {
    expect(resolveTurnAction(['main-question'], 'follow-up')).toEqual({ action: 'main-question', useClosingMessage: false })
  })

  it('uses an extra main question as a follow-up when one is still allowed', () => {
    expect(resolveTurnAction(['follow-up', 'finish'], 'main-question')).toEqual({ action: 'follow-up', useClosingMessage: false })
  })

  it('finishes with the fixed closing line when only finishing is allowed', () => {
    expect(resolveTurnAction(['finish'], 'follow-up')).toEqual({ action: 'finish', useClosingMessage: true })
    expect(resolveTurnAction(['finish'], 'main-question')).toEqual({ action: 'finish', useClosingMessage: true })
  })

  it('cannot resolve an early finish', () => {
    expect(resolveTurnAction(['follow-up', 'main-question'], 'finish')).toBeNull()
  })
})

describe('blankAnswerGrading', () => {
  it('marks every required item missing and scores zero', () => {
    const question = {
      rubric: { required: [{ point: 'a', explanation: '' }, { point: 'b', explanation: '' }], bonus: [], deductions: [], commonMistakes: [] },
      perspectives: ['p1', 'p2'],
      relatedStudyTopics: ['t1', 't2', 't3', 't4', 't5', 't6'],
    } as unknown as QuestionContent
    const grading = blankAnswerGrading(question, 'claude', at)
    expect(grading.totalScore).toBe(0)
    expect(grading.requiredCoverage.map((item) => item.status)).toEqual(['missing', 'missing'])
    expect(grading.perspectiveScores.map((item) => item.score)).toEqual([0, 0])
    expect(grading.studyRecommendations).toHaveLength(5)
  })
})
