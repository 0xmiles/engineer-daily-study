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

/**
 * Copies seed questions that were never imported before. The imported list is kept separately so a seed
 * question the user deleted does not come back on the next launch.
 */
export function importSeedQuestions(repositories: Repositories, dataDirectory: string, seedDirectory: string): number {
  if (!existsSync(seedDirectory)) return 0
  const listPath = join(dataDirectory, IMPORTED_LIST_FILE)
  const imported = readImportedIds(listPath)
  const newSeeds = readdirSync(seedDirectory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(seedDirectory, name), 'utf8')) as Question)
    .filter((question) => !imported.has(question.id))
  for (const question of newSeeds) {
    if (!repositories.questions.read(question.id)) repositories.saveQuestion(question)
    imported.add(question.id)
  }
  writeImportedIds(listPath, imported)
  return newSeeds.length
}
