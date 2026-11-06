import type { StudyNote } from '@shared/api'
import type { Topic } from '@shared/types'

export type StatusFilter = 'todo' | 'done' | 'all'
export type KindFilter = 'recommended' | 'question' | 'manual'

export interface NoteFilters {
  kind: KindFilter | ''
  /** Empty means every topic. */
  topics: Topic[]
  /** Keep only notes whose study material has been written. */
  guideOnly: boolean
}

/** Everything the notes list remembers while the user opens a note and comes back. */
export interface NotesView extends NoteFilters {
  status: StatusFilter
}

export const DEFAULT_NOTES_VIEW: NotesView = { status: 'todo', kind: '', topics: [], guideOnly: false }

export function isDefaultNotesView(view: NotesView): boolean {
  return view.status === DEFAULT_NOTES_VIEW.status && view.kind === '' && view.topics.length === 0 && !view.guideOnly
}

export function matchesStatus(note: StudyNote, status: StatusFilter): boolean {
  return status === 'all' || (status === 'done') === note.isDone
}

// A keyword a grading recommended and a question also needs counts as both.
function matchesKind(note: StudyNote, kind: KindFilter | ''): boolean {
  if (kind === 'recommended') return note.sources.length > 0
  if (kind === 'question') return note.questions.length > 0
  if (kind === 'manual') return note.addedAt !== null
  return true
}

// Selecting several topics widens the list: a note on any of them stays.
function matchesTopics(note: StudyNote, topics: Topic[]): boolean {
  return topics.length === 0 || note.topics.some((topic) => topics.includes(topic))
}

export function matchesFilters(note: StudyNote, filters: NoteFilters): boolean {
  return matchesKind(note, filters.kind) && matchesTopics(note, filters.topics) && (!filters.guideOnly || note.hasGuide)
}

export function toggleValue<T>(selected: T[], value: T): T[] {
  return selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]
}
