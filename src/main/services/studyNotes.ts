import type { StudyNoteState } from '@shared/types'
import type { StudyNote, StudyNoteChanges } from '@shared/api'
import { buildStudyNotes } from '../domain/studyNotes'
import type { Repositories } from '../store/repositories'
import type { AppContext } from './appContext'

const MAX_MEMO_LENGTH = 5000

export function listStudyNotes(repositories: Repositories): StudyNote[] {
  return buildStudyNotes({
    attempts: repositories.attempts.readAll(),
    questions: repositories.questions.readAll(),
    interviews: repositories.interviews.readAll(),
    states: repositories.studyNotes.readAll(),
  })
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
  if (!listStudyNotes(repositories).some((note) => note.key === key)) throw new Error('학습 노트를 찾을 수 없습니다.')
  const saved = repositories.studyNotes.read(key)
  const now = new Date().toISOString()
  const doneAt = changes.done === undefined ? (saved?.doneAt ?? null) : changes.done ? now : null
  const state: StudyNoteState = { key, memo: changes.memo ?? saved?.memo ?? '', doneAt, updatedAt: now }
  repositories.studyNotes.write(key, state)
  context.notifyDataChanged()
}
