import type { StudyNote } from '@shared/api'
import type { Topic } from '@shared/types'

export type StatusFilter = 'todo' | 'done' | 'all'
export type KindFilter = 'recommended' | 'question'

export interface NoteFilters {
  kind: KindFilter | ''
  /** Empty means every topic. */
  topics: Topic[]
  /** Keep only notes whose study material has been written. */
  guideOnly: boolean
}

export function matchesStatus(note: StudyNote, status: StatusFilter): boolean {
  return status === 'all' || (status === 'done') === note.isDone
}

// A keyword a grading recommended and a question also needs counts as both.
function matchesKind(note: StudyNote, kind: KindFilter | ''): boolean {
  if (kind === 'recommended') return note.sources.length > 0
  if (kind === 'question') return note.questions.length > 0
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
