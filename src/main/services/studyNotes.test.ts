import { afterEach, describe, expect, it } from 'vitest'
import type { Question } from '@shared/types'
import type { AppContext } from './appContext'
import { addStudyNote, deleteStudyNote, getStudyNote, listStudyNotes, updateStudyNote } from './studyNotes'
import { createTestAppContext, questionContentFor, removeTestDataDirectories } from './testAppContext'

const GUIDE = {
  summary: '요약', sections: [{ heading: '개념', body: '본문' }], pitfalls: [], selfCheck: [], relatedKeywords: [],
  generatedAt: '2026-10-01T00:00:00.000Z', runner: 'claude' as const,
}

function saveQuestionNeeding(context: AppContext, keyword: string): void {
  const content = questionContentFor({ format: 'concept', category: 'why', topic: 'kafka', difficulty: 'middle' }, '메시지 발행')
  const question = { ...content, relatedStudyTopics: [keyword], id: 'q-1', source: 'seed', reviewStatus: 'reviewed', createdAt: '2026-10-01T00:00:00Z', variantOf: null } as Question
  context.repositories().saveQuestion(question)
}

afterEach(removeTestDataDirectories)

describe('addStudyNote', () => {
  it('adds a keyword nothing else names, with the topics the user chose', () => {
    const context = createTestAppContext()
    const note = addStudyNote(context, { keyword: '  Outbox CDC (Debezium) ', topics: ['kafka', 'distributed-systems', 'kafka'] })

    expect(note).toMatchObject({ keyword: 'Outbox CDC (Debezium)', topics: ['kafka', 'distributed-systems'], sources: [], questions: [], isDone: false, hasGuide: false })
    expect(note.addedAt).not.toBeNull()
    expect(listStudyNotes(context.repositories()).map((entry) => entry.keyword)).toEqual(['Outbox CDC (Debezium)'])
    expect(getStudyNote(context.repositories(), 'outbox-cdc-debezium')).toMatchObject({ key: note.key, guide: null })
  })

  it('rejects a blank or overlong keyword and a topic that does not exist', () => {
    const context = createTestAppContext()
    expect(() => addStudyNote(context, { keyword: '   ', topics: [] })).toThrow('키워드를 입력하세요.')
    expect(() => addStudyNote(context, { keyword: '가'.repeat(101), topics: [] })).toThrow('100자')
    expect(() => addStudyNote(context, { keyword: 'Outbox', topics: ['no-such-topic'] })).toThrow('없는 주제')
    expect(listStudyNotes(context.repositories())).toEqual([])
  })

  it('returns the note a question already made for the keyword without marking it as added', () => {
    const context = createTestAppContext()
    saveQuestionNeeding(context, 'Transactional Outbox')

    const note = addStudyNote(context, { keyword: 'transactional-outbox', topics: ['cache'] })

    expect(note).toMatchObject({ keyword: 'Transactional Outbox', topics: ['kafka'], addedAt: null })
    expect(context.repositories().studyNotes.read(note.key)).toBeNull()
  })

  it('brings back the memo and material of a keyword added again, as a note still to study', () => {
    const context = createTestAppContext()
    const note = addStudyNote(context, { keyword: 'Outbox CDC', topics: [] })
    updateStudyNote(context, note.key, { memo: '메모', done: true })
    const saved = context.repositories().studyNotes.read(note.key)!
    context.repositories().studyNotes.write(note.key, { key: note.key, memo: saved.memo, doneAt: saved.doneAt, updatedAt: saved.updatedAt, guide: GUIDE })

    const readded = addStudyNote(context, { keyword: 'Outbox CDC', topics: ['kafka'] })

    expect(readded).toMatchObject({ memo: '메모', hasGuide: true, isDone: false, topics: ['kafka'] })
  })
})

describe('deleteStudyNote', () => {
  it('deletes a note the user added, with its memo and material', () => {
    const context = createTestAppContext()
    const note = addStudyNote(context, { keyword: 'Outbox CDC', topics: [] })
    updateStudyNote(context, note.key, { memo: '메모' })

    deleteStudyNote(context, note.key)

    expect(listStudyNotes(context.repositories())).toEqual([])
    expect(context.repositories().studyNotes.read(note.key)).toBeNull()
  })

  it('refuses a note a grading or question names, since it would come back', () => {
    const context = createTestAppContext()
    saveQuestionNeeding(context, 'Transactional Outbox')
    const [fromQuestion] = listStudyNotes(context.repositories())
    expect(() => deleteStudyNote(context, fromQuestion.key)).toThrow('직접 추가한 노트만')

    const added = addStudyNote(context, { keyword: 'Outbox CDC', topics: [] })
    saveQuestionNeeding(context, 'Outbox CDC')
    expect(() => deleteStudyNote(context, added.key)).toThrow('문제에서도')
    expect(context.repositories().studyNotes.read(added.key)).not.toBeNull()
  })
})
