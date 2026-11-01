import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export type SkillName = 'daily-study-question-author' | 'daily-study-grader' | 'daily-study-interviewer' | 'daily-study-tutor'
export type SchemaName =
  | 'question-content'
  | 'grading-result'
  | 'duplicate-check'
  | 'hint'
  | 'follow-up-questions'
  | 'follow-up-evaluation'
  | 'inquiry-answer'
  | 'interview-turn'
  | 'interview-report'
  | 'study-guide'

/** Packaged builds ship skills, schemas and seed under resources/; development reads them from the project root. */
export function resourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : app.getAppPath()
}

export function schemaPath(schema: SchemaName): string {
  return join(resourcesRoot(), 'schemas', `${schema}.schema.json`)
}

export function readSchema(schema: SchemaName): object {
  return JSON.parse(readFileSync(schemaPath(schema), 'utf8'))
}

/** SKILL.md followed by every reference document, each labelled with its relative path. */
export function readSkillDocuments(skill: SkillName): string {
  const skillDirectory = join(resourcesRoot(), 'skills', skill)
  const referencesDirectory = join(skillDirectory, 'references')
  const referenceFiles = existsSync(referencesDirectory)
    ? readdirSync(referencesDirectory).filter((name) => name.endsWith('.md')).sort()
    : []
  const sections = [
    `<file path="SKILL.md">\n${readFileSync(join(skillDirectory, 'SKILL.md'), 'utf8')}\n</file>`,
    ...referenceFiles.map(
      (name) => `<file path="references/${name}">\n${readFileSync(join(referencesDirectory, name), 'utf8')}\n</file>`,
    ),
  ]
  return sections.join('\n\n')
}

/** Packaged builds ship the tray icon under resources/; development reads the Windows app icon from build/. */
export function trayIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'tray-icon.png') : join(app.getAppPath(), 'build', 'icon-windows.png')
}

export function seedQuestionsDirectory(): string {
  return join(resourcesRoot(), 'seed', 'questions')
}
