import type { Difficulty, Question } from '@shared/types'
import type { StudyNote, StudyNoteSource } from '@shared/api'
import { normalizeStudyGuide, type StudyGuideContent } from '../domain/studyGuide'
import { runSkill } from '../llm/skillRunner'
import type { Repositories } from '../store/repositories'
import type { AppContext } from './appContext'
import { requireStudyNote, saveStudyGuide } from './studyNotes'
import { listTopics } from './topics'

function sourceDifficulty(repositories: Repositories, source: StudyNoteSource): Difficulty | null {
  if (source.kind === 'interview') return repositories.interviews.read(source.id)?.difficulty ?? null
  const attempt = repositories.attempts.read(source.id)
  return (attempt && repositories.questions.read(attempt.questionId)?.difficulty) ?? null
}

/** How a bank question uses the keyword, so the tutor scopes the note to what solving it takes. */
function questionPayload(question: Question): object {
  const { title, format, difficulty, keyIssues } = question
  return { title, format, difficulty, keyIssues, requiredPoints: question.rubric.required.map((item) => item.point) }
}

/**
 * The tutor sees why the keyword was recommended and which bank questions need it,
 * so the material starts from the gaps the gradings found and reaches as deep as the questions go.
 */
function studyGuidePayload(repositories: Repositories, note: StudyNote): object {
  const questions = note.questions.map(({ id }) => repositories.questions.read(id)).filter((question): question is Question => question !== null)
  return {
    keyword: note.keyword,
    topics: listTopics(repositories)
      .filter((topic) => note.topics.includes(topic.value))
      .map(({ value, label, description }) => ({ value, label, description })),
    recommendations: note.sources.map((source) => ({
      from: source.title,
      difficulty: sourceDifficulty(repositories, source),
      reason: source.reason,
      searchQuery: source.searchQuery,
    })),
    questions: questions.map(questionPayload),
  }
}

export function generateStudyGuide(context: AppContext, key: string): string {
  const note = requireStudyNote(context.repositories(), key)
  // The keyword, not the key, is the target: the renderer opens notes by keyword when the job finishes.
  if (context.jobs.isRunningFor('study-guide', note.keyword)) throw new Error('이 키워드의 학습 노트를 이미 만들고 있습니다.')
  return context.jobs.start('study-guide', `학습 노트: ${note.keyword}`, async (job) => {
    job.setTarget(note.keyword)
    const settings = context.settings()
    const content = await runSkill<StudyGuideContent>({
      skill: 'daily-study-tutor',
      schema: 'study-guide',
      payload: studyGuidePayload(context.repositories(), note),
      settings,
      signal: job.signal,
      onStage: job.setStage,
    })
    const guide = { ...normalizeStudyGuide(content, note.keyword), generatedAt: new Date().toISOString(), runner: settings.runner }
    saveStudyGuide(context.repositories(), key, guide)
  }, { onSucceeded: context.notifyDataChanged })
}
