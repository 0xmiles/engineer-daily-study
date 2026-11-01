import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Attempt, DailySet, Feedback, Interview, Question, StudyNoteState, TopicConfig } from '@shared/types'
import { JsonDirectory, JsonFile } from './jsonDirectory'

export class Repositories {
  readonly questions: JsonDirectory<Question>
  readonly attempts: JsonDirectory<Attempt>
  readonly dailySets: JsonDirectory<DailySet>
  readonly feedback: JsonDirectory<Feedback>
  readonly interviews: JsonDirectory<Interview>
  readonly studyNotes: JsonDirectory<StudyNoteState>
  readonly topicConfig: JsonFile<TopicConfig>

  constructor(dataDirectory: string) {
    this.questions = new JsonDirectory(join(dataDirectory, 'questions'))
    this.attempts = new JsonDirectory(join(dataDirectory, 'attempts'))
    this.dailySets = new JsonDirectory(join(dataDirectory, 'daily'))
    this.feedback = new JsonDirectory(join(dataDirectory, 'feedback'))
    this.interviews = new JsonDirectory(join(dataDirectory, 'interviews'))
    this.studyNotes = new JsonDirectory(join(dataDirectory, 'notes'))
    this.topicConfig = new JsonFile(join(dataDirectory, 'topics.json'))
  }

  saveQuestion(question: Question): void {
    this.questions.write(question.id, question)
  }

  saveAttempt(attempt: Attempt): void {
    this.attempts.write(attempt.id, attempt)
  }

  saveFeedback(feedback: Feedback): void {
    this.feedback.write(feedback.id, feedback)
  }

  saveDailySet(dailySet: DailySet): void {
    this.dailySets.write(dailySet.date, dailySet)
  }

  saveInterview(interview: Interview): void {
    this.interviews.write(interview.id, interview)
  }

  /** Read-modify-write in one synchronous step, so concurrent jobs on the same attempt never drop each other's changes. */
  updateAttempt(id: string, change: (attempt: Attempt) => Partial<Attempt>): Attempt {
    const attempt = this.requireAttempt(id)
    const updated = { ...attempt, ...change(attempt) }
    this.saveAttempt(updated)
    return updated
  }

  requireQuestion(id: string): Question {
    const question = this.questions.read(id)
    if (!question) throw new Error(`문제를 찾을 수 없습니다: ${id}`)
    return question
  }

  requireAttempt(id: string): Attempt {
    const attempt = this.attempts.read(id)
    if (!attempt) throw new Error(`풀이를 찾을 수 없습니다: ${id}`)
    return attempt
  }

  requireInterview(id: string): Interview {
    const interview = this.interviews.read(id)
    if (!interview) throw new Error(`모의 면접을 찾을 수 없습니다: ${id}`)
    return interview
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
}
