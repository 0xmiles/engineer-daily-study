import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { QuestionContent, QuestionSpec, Settings } from '@shared/types'
import { JobManager, type JobContext } from '../jobs/jobManager'
import { Repositories } from '../store/repositories'
import type { AppContext } from './appContext'

const dataDirectories: string[] = []

/** An app context over a fresh temporary data directory, for service tests that replace the LLM call. */
export function createTestAppContext(): AppContext {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'daily-study-test-'))
  dataDirectories.push(dataDirectory)
  const repositories = new Repositories(dataDirectory)
  const settings = { runner: 'claude', difficulty: 'middle', dailyCount: 2, dataDirectory: '', claudePath: '', codexPath: '', model: '' } as Settings
  return { settings: () => settings, repositories: () => repositories, jobs: new JobManager(() => {}), notifyDataChanged: () => {} }
}

export function removeTestDataDirectories(): void {
  for (const dataDirectory of dataDirectories.splice(0)) rmSync(dataDirectory, { recursive: true, force: true })
}

export function createTestJob(signal: AbortSignal = new AbortController().signal): JobContext {
  return { signal, setStage: () => {}, setLabel: () => {}, setTarget: () => {} }
}

/** Content the fake question author returns: the requested classification with the given title. */
export function questionContentFor(payload: QuestionSpec, title: string): QuestionContent {
  return {
    format: payload.format, category: payload.category!, topic: payload.topic!, difficulty: payload.difficulty, title,
    situation: '', requirements: [], recommendedLength: { min: 0, max: 0 }, keyIssues: [],
    rubric: { required: [], bonus: [], deductions: [], commonMistakes: [] }, perspectives: [], modelAnswer: '', relatedStudyTopics: [],
  }
}
