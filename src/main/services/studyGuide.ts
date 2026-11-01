import type { Difficulty } from '@shared/types'
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

/** The tutor sees why the keyword was recommended, so the material starts from the gaps the gradings found. */
function studyGuidePayload(repositories: Repositories, note: StudyNote): object {
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
