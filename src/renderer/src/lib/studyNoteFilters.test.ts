import { describe, expect, it } from 'vitest'
import type { StudyNote, StudyNoteSource } from '@shared/api'
import { DEFAULT_NOTES_VIEW, isDefaultNotesView, matchesFilters, matchesStatus, toggleValue, type NoteFilters } from './studyNoteFilters'

function note(overrides: Partial<StudyNote>): StudyNote {
  return {
    key: 'k',
    keyword: 'k',
    sources: [],
    questions: [],
    topics: [],
    memo: '',
    isDone: false,
    isReopened: false,
    lastRecommendedAt: null,
    hasGuide: false,
    addedAt: null,
    ...overrides,
  }
}

const NO_FILTERS: NoteFilters = { kind: '', topics: [], guideOnly: false }
const SOURCE: StudyNoteSource = { kind: 'attempt', id: 'a', title: 't', reason: 'r', searchQuery: 'k', recommendedAt: '2026-11-01' }

describe('matchesFilters', () => {
  it('keeps every note when no filter is set', () => {
    expect(matchesFilters(note({ topics: ['kafka'] }), NO_FILTERS)).toBe(true)
    expect(matchesFilters(note({}), NO_FILTERS)).toBe(true)
  })

  it('keeps a note that has any of the selected topics', () => {
    const filters = { ...NO_FILTERS, topics: ['kafka', 'cache'] }
    expect(matchesFilters(note({ topics: ['cache'] }), filters)).toBe(true)
    expect(matchesFilters(note({ topics: ['mysql', 'kafka'] }), filters)).toBe(true)
    expect(matchesFilters(note({ topics: ['mysql'] }), filters)).toBe(false)
    expect(matchesFilters(note({ topics: [] }), filters)).toBe(false)
  })

  it('keeps only notes with a written guide when asked', () => {
    const filters = { ...NO_FILTERS, guideOnly: true }
    expect(matchesFilters(note({ hasGuide: true }), filters)).toBe(true)
    expect(matchesFilters(note({ hasGuide: false }), filters)).toBe(false)
  })

  it('counts a keyword both recommended and needed by a question as either kind', () => {
    const both = note({ sources: [SOURCE], questions: [{ id: 'q', title: 't' }] })
    expect(matchesFilters(both, { ...NO_FILTERS, kind: 'recommended' })).toBe(true)
    expect(matchesFilters(both, { ...NO_FILTERS, kind: 'question' })).toBe(true)
    expect(matchesFilters(note({ questions: [{ id: 'q', title: 't' }] }), { ...NO_FILTERS, kind: 'recommended' })).toBe(false)
  })

  it('keeps the notes the user added when asked for that kind', () => {
    const filters = { ...NO_FILTERS, kind: 'manual' as const }
    expect(matchesFilters(note({ addedAt: '2026-11-06T00:00:00.000Z' }), filters)).toBe(true)
    expect(matchesFilters(note({ questions: [{ id: 'q', title: 't' }] }), filters)).toBe(false)
  })

  it('requires every filter to match', () => {
    const filters: NoteFilters = { kind: 'question', topics: ['kafka'], guideOnly: true }
    const base = { questions: [{ id: 'q', title: 't' }], topics: ['kafka'], hasGuide: true }
    expect(matchesFilters(note(base), filters)).toBe(true)
    expect(matchesFilters(note({ ...base, hasGuide: false }), filters)).toBe(false)
    expect(matchesFilters(note({ ...base, topics: ['cache'] }), filters)).toBe(false)
    expect(matchesFilters(note({ ...base, questions: [] }), filters)).toBe(false)
  })
})

describe('matchesStatus', () => {
  it('splits notes by done state', () => {
    expect(matchesStatus(note({ isDone: false }), 'todo')).toBe(true)
    expect(matchesStatus(note({ isDone: true }), 'todo')).toBe(false)
    expect(matchesStatus(note({ isDone: true }), 'done')).toBe(true)
    expect(matchesStatus(note({ isDone: true }), 'all')).toBe(true)
  })
})

describe('toggleValue', () => {
  it('adds a value that is not selected and removes one that is', () => {
    expect(toggleValue(['kafka'], 'cache')).toEqual(['kafka', 'cache'])
    expect(toggleValue(['kafka', 'cache'], 'kafka')).toEqual(['cache'])
  })
})

describe('isDefaultNotesView', () => {
  it('is true only when nothing narrows the list beyond the open notes', () => {
    expect(isDefaultNotesView(DEFAULT_NOTES_VIEW)).toBe(true)
    expect(isDefaultNotesView({ ...DEFAULT_NOTES_VIEW, status: 'all' })).toBe(false)
    expect(isDefaultNotesView({ ...DEFAULT_NOTES_VIEW, kind: 'manual' })).toBe(false)
    expect(isDefaultNotesView({ ...DEFAULT_NOTES_VIEW, topics: ['kafka'] })).toBe(false)
    expect(isDefaultNotesView({ ...DEFAULT_NOTES_VIEW, guideOnly: true })).toBe(false)
  })
})
