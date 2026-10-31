import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Attempt, DailySet, Feedback, Question } from '@shared/types'
import { JsonDirectory } from './jsonDirectory'

export class Repositories {
  readonly questions: JsonDirectory<Question>
  readonly attempts: JsonDirectory<Attempt>
  readonly dailySets: JsonDirectory<DailySet>
  readonly feedback: JsonDirectory<Feedback>

  constructor(dataDirectory: string) {
    this.questions = new JsonDirectory(join(dataDirectory, 'questions'))
    this.attempts = new JsonDirectory(join(dataDirectory, 'attempts'))
    this.dailySets = new JsonDirectory(join(dataDirectory, 'daily'))
    this.feedback = new JsonDirectory(join(dataDirectory, 'feedback'))
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
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
}
