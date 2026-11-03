import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Attempt, Question } from '@shared/types'
import { Repositories } from '../store/repositories'
import { importSeedQuestions } from './seedImport'

function seedQuestion(id: string, title: string): Question {
  return {
    id, source: 'seed', reviewStatus: 'unreviewed', createdAt: '2026-10-31T00:00:00.000Z', variantOf: null,
    format: 'scenario', category: 'incident-diagnosis', topic: 'kafka', difficulty: 'middle', title,
    situation: '상황', requirements: ['요구'], recommendedLength: { min: 700, max: 1300 }, keyIssues: ['a', 'b', 'c'],
    rubric: { required: [], bonus: [], deductions: [], commonMistakes: [] }, perspectives: [], modelAnswer: '답', relatedStudyTopics: [],
  }
}

describe('importSeedQuestions', () => {
  const directories: string[] = []
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  })

  function setUp(): { dataDirectory: string; seedDirectory: string; repositories: Repositories; writeSeed: (question: Question) => void } {
    const root = mkdtempSync(join(tmpdir(), 'seed-import-'))
    directories.push(root)
    const dataDirectory = join(root, 'data')
    const seedDirectory = join(root, 'seed')
    mkdirSync(seedDirectory)
    const writeSeed = (question: Question): void => writeFileSync(join(seedDirectory, `${question.id}.json`), JSON.stringify(question))
    return { dataDirectory, seedDirectory, repositories: new Repositories(dataDirectory), writeSeed }
  }

  it('replaces an unseen seed whose content changed and keeps the user review status', () => {
    const { dataDirectory, seedDirectory, repositories, writeSeed } = setUp()
    writeSeed(seedQuestion('seed-a', '옛 제목'))
    importSeedQuestions(repositories, dataDirectory, seedDirectory)
    repositories.saveQuestion({ ...repositories.requireQuestion('seed-a'), reviewStatus: 'reviewed' })

    writeSeed(seedQuestion('seed-a', '새 제목'))
    importSeedQuestions(repositories, dataDirectory, seedDirectory)

    expect(repositories.requireQuestion('seed-a')).toMatchObject({ title: '새 제목', reviewStatus: 'reviewed' })
  })

  it('keeps a served or attempted seed unchanged', () => {
    const { dataDirectory, seedDirectory, repositories, writeSeed } = setUp()
    writeSeed(seedQuestion('seed-served', '옛 제목'))
    writeSeed(seedQuestion('seed-attempted', '옛 제목'))
    importSeedQuestions(repositories, dataDirectory, seedDirectory)
    repositories.saveQuestion({ ...repositories.requireQuestion('seed-served'), servedAt: '2026-10-31T01:00:00.000Z' })
    repositories.saveAttempt({ id: 'a-1', questionId: 'seed-attempted' } as Attempt)

    writeSeed(seedQuestion('seed-served', '새 제목'))
    writeSeed(seedQuestion('seed-attempted', '새 제목'))
    importSeedQuestions(repositories, dataDirectory, seedDirectory)

    expect(repositories.requireQuestion('seed-served').title).toBe('옛 제목')
    expect(repositories.requireQuestion('seed-attempted').title).toBe('옛 제목')
  })

  it('does not bring back a seed the user deleted', () => {
    const { dataDirectory, seedDirectory, repositories, writeSeed } = setUp()
    writeSeed(seedQuestion('seed-a', '제목'))
    importSeedQuestions(repositories, dataDirectory, seedDirectory)
    repositories.questions.remove('seed-a')

    writeSeed(seedQuestion('seed-a', '새 제목'))
    importSeedQuestions(repositories, dataDirectory, seedDirectory)

    expect(repositories.questions.read('seed-a')).toBeNull()
  })
})
