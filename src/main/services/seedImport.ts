import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Question } from '@shared/types'
import type { Repositories } from '../store/repositories'

const IMPORTED_LIST_FILE = 'seed-imported.json'

// A damaged list only means seed questions the user deleted may come back; it must not stop the app from starting.
function readImportedIds(listPath: string): Set<string> {
  if (!existsSync(listPath)) return new Set()
  try {
    return new Set<string>(JSON.parse(readFileSync(listPath, 'utf8')))
  } catch {
    return new Set()
  }
}

function writeImportedIds(listPath: string, imported: Set<string>): void {
  const temporaryPath = `${listPath}.tmp`
  writeFileSync(temporaryPath, JSON.stringify([...imported], null, 2), 'utf8')
  renameSync(temporaryPath, listPath)
}

function readSeedQuestions(seedDirectory: string): Question[] {
  return readdirSync(seedDirectory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(seedDirectory, name), 'utf8')) as Question)
}

function contentOf(question: Question): string {
  const { id: _id, source: _source, reviewStatus: _reviewStatus, createdAt: _createdAt, variantOf: _variantOf, servedAt: _servedAt, ...content } = question
  return JSON.stringify(content)
}

/**
 * A seed rewritten in a later release replaces the stored copy only while nobody has seen it.
 * Served or attempted questions keep their old content so past gradings still match their rubric.
 */
function refreshUnservedSeeds(repositories: Repositories, seeds: Question[]): void {
  const attemptedQuestionIds = new Set(repositories.attempts.readAll().map((attempt) => attempt.questionId))
  for (const seed of seeds) {
    const stored = repositories.questions.read(seed.id)
    if (!stored || stored.source !== 'seed' || stored.servedAt || attemptedQuestionIds.has(seed.id)) continue
    if (contentOf(stored) === contentOf(seed)) continue
    repositories.saveQuestion({ ...seed, reviewStatus: stored.reviewStatus })
  }
}

/**
 * Copies seed questions that were never imported before and refreshes unseen ones whose content changed.
 * The imported list is kept separately so a seed question the user deleted does not come back on the next launch.
 */
export function importSeedQuestions(repositories: Repositories, dataDirectory: string, seedDirectory: string): void {
  if (!existsSync(seedDirectory)) return
  const listPath = join(dataDirectory, IMPORTED_LIST_FILE)
  const imported = readImportedIds(listPath)
  const seeds = readSeedQuestions(seedDirectory)
  for (const question of seeds.filter((seed) => !imported.has(seed.id))) {
    if (!repositories.questions.read(question.id)) repositories.saveQuestion(question)
    imported.add(question.id)
  }
  refreshUnservedSeeds(repositories, seeds.filter((seed) => imported.has(seed.id)))
  writeImportedIds(listPath, imported)
}
