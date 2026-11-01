import { describe, expect, it } from 'vitest'
import type { Attempt, ConversationInterview, Question, StudyNoteState } from '@shared/types'
import { buildStudyNotes, normalizeKeyword, studyNoteKey } from './studyNotes'

function question(id: string, topic: string): Question {
  return { id, topic, title: `문제 ${id}` } as Question
}

function gradedAttempt(id: string, questionId: string, gradedAt: string, keywords: string[]): Attempt {
  const studyRecommendations = keywords.map((keyword) => ({ keyword, reason: `${id}에서 추천`, searchQuery: `${keyword} 검색` }))
  return { id, questionId, status: 'graded', grading: { gradedAt, studyRecommendations } } as unknown as Attempt
}

function completedInterview(id: string, completedAt: string, keywords: string[]): ConversationInterview {
  const studyRecommendations = keywords.map((keyword) => ({ keyword, reason: '면접에서 추천', searchQuery: keyword }))
  return { id, mode: 'conversation', status: 'completed', topic: 'kafka', completedAt, report: { studyRecommendations } } as unknown as ConversationInterview
}

function state(keyword: string, doneAt: string | null, memo = ''): StudyNoteState {
  return { key: studyNoteKey(keyword), memo, doneAt, updatedAt: doneAt ?? '2026-10-01T00:00:00.000Z' }
}

const questions = [question('q1', 'kafka'), question('q2', 'cache')]

describe('normalizeKeyword', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(normalizeKeyword('Kafka 리밸런싱')).toBe(normalizeKeyword('kafka-리밸런싱.'))
    expect(studyNoteKey('Kafka 리밸런싱')).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('buildStudyNotes', () => {
  it('groups the same keyword across gradings, newest source and spelling first', () => {
    const attempts = [
      gradedAttempt('a1', 'q1', '2026-10-01T00:00:00.000Z', ['kafka 리밸런싱']),
      gradedAttempt('a2', 'q2', '2026-10-05T00:00:00.000Z', ['Kafka 리밸런싱']),
    ]
    const [note] = buildStudyNotes({ attempts, questions, interviews: [], states: [] })
    expect(note.keyword).toBe('Kafka 리밸런싱')
    expect(note.sources.map((source) => source.id)).toEqual(['a2', 'a1'])
    expect(note.topics).toEqual(['cache', 'kafka'])
    expect(note.lastRecommendedAt).toBe('2026-10-05T00:00:00.000Z')
  })

  it('takes recommendations from completed conversation interviews only', () => {
    const interviews = [
      completedInterview('i1', '2026-10-03T00:00:00.000Z', ['ISR']),
      { ...completedInterview('i2', '2026-10-04T00:00:00.000Z', ['acks']), status: 'reporting' } as ConversationInterview,
    ]
    const notes = buildStudyNotes({ attempts: [], questions, interviews, states: [] })
    expect(notes.map((note) => note.keyword)).toEqual(['ISR'])
    expect(notes[0].sources[0]).toMatchObject({ kind: 'interview', id: 'i1', title: expect.stringContaining('대화형 모의 면접') })
  })

  it('skips attempts that are not graded and counts one grading once', () => {
    const draft = { ...gradedAttempt('a3', 'q1', '2026-10-06T00:00:00.000Z', ['MVCC']), status: 'draft' } as Attempt
    const attempts = [draft, gradedAttempt('a4', 'q1', '2026-10-06T00:00:00.000Z', ['MVCC', 'mvcc'])]
    const [note] = buildStudyNotes({ attempts, questions, interviews: [], states: [] })
    expect(note.sources.map((source) => source.id)).toEqual(['a4'])
  })

  it('reopens a done note once it is recommended again after being marked done', () => {
    const attempts = [gradedAttempt('a1', 'q1', '2026-10-01T00:00:00.000Z', ['MVCC'])]
    const done = buildStudyNotes({ attempts, questions, interviews: [], states: [state('MVCC', '2026-10-02T00:00:00.000Z', '메모')] })[0]
    expect(done).toMatchObject({ isDone: true, isReopened: false, memo: '메모' })

    const recommendedAgain = [...attempts, gradedAttempt('a2', 'q1', '2026-10-03T00:00:00.000Z', ['MVCC'])]
    const reopened = buildStudyNotes({ attempts: recommendedAgain, questions, interviews: [], states: [state('MVCC', '2026-10-02T00:00:00.000Z')] })[0]
    expect(reopened).toMatchObject({ isDone: false, isReopened: true })
  })

  it('puts open notes first, reopened ones on top, then the most recommended', () => {
    const attempts = [
      gradedAttempt('a1', 'q1', '2026-10-01T00:00:00.000Z', ['done', 'once', 'twice', 'reopened']),
      gradedAttempt('a2', 'q1', '2026-10-02T00:00:00.000Z', ['twice']),
      gradedAttempt('a3', 'q1', '2026-10-04T00:00:00.000Z', ['reopened']),
    ]
    const states = [state('done', '2026-10-03T00:00:00.000Z'), state('reopened', '2026-10-03T00:00:00.000Z')]
    const notes = buildStudyNotes({ attempts, questions, interviews: [], states })
    expect(notes.map((note) => note.keyword)).toEqual(['reopened', 'twice', 'once', 'done'])
  })
})
