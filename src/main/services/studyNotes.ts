import type { StudyGuide, StudyNoteState, Topic } from '@shared/types'
import type { StudyNote, StudyNoteChanges, StudyNoteDetail, StudyNoteInput } from '@shared/api'
import { buildStudyNotes, studyNoteKey } from '../domain/studyNotes'
import type { Repositories } from '../store/repositories'
import type { AppContext } from './appContext'
import { listTopics } from './topics'

const MAX_MEMO_LENGTH = 5000
const MAX_KEYWORD_LENGTH = 100

export function listStudyNotes(repositories: Repositories): StudyNote[] {
  return buildStudyNotes({
    attempts: repositories.attempts.readAll(),
    questions: repositories.questions.readAll(),
    interviews: repositories.interviews.readAll(),
    states: repositories.studyNotes.readAll(),
  })
}

export function getStudyNote(repositories: Repositories, keyword: string): StudyNoteDetail | null {
  const key = studyNoteKey(keyword)
  const note = listStudyNotes(repositories).find((entry) => entry.key === key)
  return note ? { ...note, guide: repositories.studyNotes.read(key)?.guide ?? null } : null
}

export function requireStudyNote(repositories: Repositories, key: string): StudyNote {
  const note = listStudyNotes(repositories).find((entry) => entry.key === key)
  if (!note) throw new Error('학습 노트를 찾을 수 없습니다.')
  return note
}

function validateChanges(changes: StudyNoteChanges): void {
  if (changes.memo !== undefined && typeof changes.memo !== 'string') throw new Error('메모 형식이 올바르지 않습니다.')
  if (changes.memo !== undefined && changes.memo.length > MAX_MEMO_LENGTH) throw new Error(`메모는 ${MAX_MEMO_LENGTH}자 이하로 쓰세요.`)
  if (changes.done !== undefined && typeof changes.done !== 'boolean') throw new Error('완료 여부 값이 올바르지 않습니다.')
}

/** Stores only the user's part of the note: the memo and when it was marked done. */
export function updateStudyNote(context: AppContext, key: string, changes: StudyNoteChanges): void {
  validateChanges(changes)
  const repositories = context.repositories()
  requireStudyNote(repositories, key)
  const saved = repositories.studyNotes.read(key)
  const now = new Date().toISOString()
  const doneAt = changes.done === undefined ? (saved?.doneAt ?? null) : changes.done ? now : null
  const state: StudyNoteState = { ...saved, key, memo: changes.memo ?? saved?.memo ?? '', doneAt, updatedAt: now }
  repositories.studyNotes.write(key, state)
  context.notifyDataChanged()
}

function validateInput(repositories: Repositories, input: StudyNoteInput): { keyword: string; topics: Topic[] } {
  const keyword = typeof input?.keyword === 'string' ? input.keyword.trim() : ''
  if (!keyword) throw new Error('키워드를 입력하세요.')
  if (keyword.length > MAX_KEYWORD_LENGTH) throw new Error(`키워드는 ${MAX_KEYWORD_LENGTH}자 이하로 쓰세요.`)
  if (!Array.isArray(input.topics)) throw new Error('주제 형식이 올바르지 않습니다.')
  const knownTopics = new Set(listTopics(repositories).map((topic) => topic.value))
  const unknownTopic = input.topics.find((topic) => !knownTopics.has(topic))
  if (unknownTopic !== undefined) throw new Error(`없는 주제입니다: ${unknownTopic}`)
  return { keyword, topics: [...new Set(input.topics)] }
}

/**
 * A keyword a grading, interview or question already names keeps its note as it is. A keyword whose question or grading
 * is gone still has its stored memo and material, and those come back with it as a note still to study.
 */
export function addStudyNote(context: AppContext, input: StudyNoteInput): StudyNote {
  const repositories = context.repositories()
  const { keyword, topics } = validateInput(repositories, input)
  const key = studyNoteKey(keyword)
  const existing = listStudyNotes(repositories).find((note) => note.key === key)
  if (existing) return existing
  const now = new Date().toISOString()
  const saved = repositories.studyNotes.read(key)
  repositories.studyNotes.write(key, { key, memo: '', ...saved, doneAt: null, updatedAt: now, manual: { keyword, topics, addedAt: now } })
  context.notifyDataChanged()
  return requireStudyNote(repositories, key)
}

/** Only a note nothing but the user names can go; any other note would be rebuilt from its grading or question on the next read. */
export function deleteStudyNote(context: AppContext, key: string): void {
  const repositories = context.repositories()
  const note = requireStudyNote(repositories, key)
  if (note.addedAt === null) throw new Error('직접 추가한 노트만 삭제할 수 있습니다.')
  if (note.sources.length > 0 || note.questions.length > 0) throw new Error('채점 추천이나 문제에서도 나온 키워드라 삭제할 수 없습니다.')
  // A guide finishing after the delete would write the state back without the note.
  if (context.jobs.isRunningFor('study-guide', note.keyword)) throw new Error('학습 노트를 만드는 중에는 삭제할 수 없습니다.')
  repositories.studyNotes.remove(key)
  context.notifyDataChanged()
}

/** Reads the state again right before writing, so a memo saved while the guide was being written is kept. */
export function saveStudyGuide(repositories: Repositories, key: string, guide: StudyGuide): void {
  const saved = repositories.studyNotes.read(key)
  repositories.studyNotes.write(key, { key, memo: '', doneAt: null, updatedAt: guide.generatedAt, ...saved, guide })
}
