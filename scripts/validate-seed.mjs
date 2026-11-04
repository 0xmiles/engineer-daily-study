// Validates every seed question: schema, metadata, taxonomy consistency, and near-duplicates.
// Usage: node scripts/validate-seed.mjs [seed directory]
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAgainstSchema } from './minimal-schema-validator.mjs'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const seedDirectory = process.argv[2] ?? join(projectRoot, 'seed', 'questions')
const contentSchema = readJson(join(projectRoot, 'schemas', 'question-content.schema.json'))
const taxonomy = readJson(join(projectRoot, 'schemas', 'taxonomy.json'))
const METADATA_FIELDS = ['id', 'source', 'reviewStatus', 'createdAt', 'variantOf']
const DUPLICATE_SIMILARITY_THRESHOLD = 0.45
// Mirrors the "시나리오형 복합도" table in skills/daily-study-question-author/references/difficulty.md.
const SCENARIO_COMPLEXITY = {
  junior: { minRequiredItems: 3, length: { min: 400, max: 800 } },
  middle: { minRequiredItems: 4, length: { min: 700, max: 1300 } },
  senior: { minRequiredItems: 5, length: { min: 1000, max: 1800 } },
}
const MIN_SCENARIO_KEY_ISSUES = 3
// Mirrors SHORT_ANSWER_LENGTH in src/shared/rules.ts.
const SHORT_ANSWER_LENGTH = { min: 1, max: 150 }
const MIN_SHORT_ANSWER_MODEL_LENGTH = 30

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function stripMetadata(question) {
  const content = { ...question }
  for (const field of METADATA_FIELDS) delete content[field]
  return content
}

function findTaxonomyErrors(question) {
  const errors = []
  // The schema leaves topic open for custom topics; seed questions must still use a built-in one.
  if (!taxonomy.topics.some((entry) => entry.value === question.topic)) errors.push(`unknown topic ${question.topic}`)
  const category = taxonomy.categories.find((entry) => entry.value === question.category)
  if (!category) return [...errors, `unknown category ${question.category}`]
  if (category.format !== question.format) errors.push(`category ${question.category} does not belong to format ${question.format}`)
  if (JSON.stringify(category.perspectives) !== JSON.stringify(question.perspectives)) errors.push('perspectives differ from taxonomy.json')
  if (category.retiredFor) errors.push(`category ${question.category} is retired; use ${category.retiredFor}`)
  // Mirrors hasCodeBlock in src/main/services/questionAuthoring.ts.
  if ([question.title, question.situation, ...question.requirements].some((text) => text.includes('```'))) errors.push('question text must not contain a code block')
  return errors
}

function findMetadataErrors(question, fileName) {
  const errors = []
  if (`${question.id}.json` !== fileName) errors.push(`file name must be ${question.id}.json`)
  if (question.source !== 'seed') errors.push('source must be "seed"')
  if (!['reviewed', 'unreviewed'].includes(question.reviewStatus)) errors.push('invalid reviewStatus')
  if (Number.isNaN(Date.parse(question.createdAt))) errors.push('invalid createdAt')
  if (question.variantOf !== null) errors.push('variantOf must be null for seed')
  return errors
}

function findContentQualityErrors(question) {
  const errors = []
  if (question.recommendedLength.min >= question.recommendedLength.max) errors.push('recommendedLength min must be below max')
  if (question.rubric.required.length < 2) errors.push('at least 2 required rubric items')
  if (question.keyIssues.length < 2) errors.push('at least 2 keyIssues')
  if (question.modelAnswer.length < 300) errors.push('modelAnswer is too short')
  if (question.modelAnswer.includes('생략')) errors.push('modelAnswer must be complete')
  return errors
}

function findShortAnswerErrors(question) {
  const errors = []
  if (question.requirements.length > 0) errors.push('short answer must have no requirements')
  if (question.rubric.required.length !== 1) errors.push('short answer needs exactly 1 required rubric item')
  if (question.rubric.bonus.length > 0) errors.push('short answer must have no bonus rubric items')
  if (question.keyIssues.length < 1) errors.push('at least 1 keyIssue')
  if (question.modelAnswer.length < MIN_SHORT_ANSWER_MODEL_LENGTH) errors.push('modelAnswer is too short')
  const { min, max } = question.recommendedLength
  if (min !== SHORT_ANSWER_LENGTH.min || max !== SHORT_ANSWER_LENGTH.max) errors.push(`short answer recommendedLength must be ${SHORT_ANSWER_LENGTH.min}~${SHORT_ANSWER_LENGTH.max}`)
  return errors
}

function findScenarioComplexityErrors(question) {
  if (question.format !== 'scenario') return []
  const expected = SCENARIO_COMPLEXITY[question.difficulty]
  const errors = []
  if (question.keyIssues.length < MIN_SCENARIO_KEY_ISSUES) errors.push(`scenario needs at least ${MIN_SCENARIO_KEY_ISSUES} keyIssues`)
  if (question.rubric.required.length < expected.minRequiredItems) errors.push(`${question.difficulty} scenario needs at least ${expected.minRequiredItems} required rubric items`)
  const { min, max } = question.recommendedLength
  if (min !== expected.length.min || max !== expected.length.max) errors.push(`${question.difficulty} scenario recommendedLength must be ${expected.length.min}~${expected.length.max}`)
  return errors
}

function characterBigrams(text) {
  const normalized = text.replace(/\s+/g, '').toLowerCase()
  const bigrams = new Set()
  for (let index = 0; index < normalized.length - 1; index++) bigrams.add(normalized.slice(index, index + 2))
  return bigrams
}

function jaccardSimilarity(left, right) {
  let intersection = 0
  for (const value of left) if (right.has(value)) intersection++
  const union = left.size + right.size - intersection
  return union === 0 ? 0 : intersection / union
}

function findNearDuplicatePairs(questions) {
  const fingerprints = questions.map((question) => ({
    id: question.id,
    bigrams: characterBigrams(`${question.title} ${question.keyIssues.join(' ')}`),
  }))
  const pairs = []
  for (let left = 0; left < fingerprints.length; left++) {
    for (let right = left + 1; right < fingerprints.length; right++) {
      const similarity = jaccardSimilarity(fingerprints[left].bigrams, fingerprints[right].bigrams)
      if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) pairs.push(`${fingerprints[left].id} ~ ${fingerprints[right].id} (${similarity.toFixed(2)})`)
    }
  }
  return pairs
}

function countBy(questions, field) {
  const counts = {}
  for (const question of questions) counts[question[field]] = (counts[question[field]] ?? 0) + 1
  return counts
}

const fileNames = readdirSync(seedDirectory).filter((name) => name.endsWith('.json'))
const questions = []
let failureCount = 0

for (const fileName of fileNames) {
  const question = readJson(join(seedDirectory, fileName))
  const schemaErrors = validateAgainstSchema(contentSchema, stripMetadata(question))
  const errors = [...schemaErrors, ...findMetadataErrors(question, fileName), ...findTaxonomyErrors(question), ...(question.format === 'short-answer' ? findShortAnswerErrors(question) : findContentQualityErrors(question)), ...findScenarioComplexityErrors(question)]
  if (errors.length > 0) {
    failureCount++
    console.log(`FAIL ${fileName}\n  - ${errors.join('\n  - ')}`)
  }
  questions.push(question)
}

const nearDuplicatePairs = findNearDuplicatePairs(questions)
console.log(`\nchecked ${fileNames.length} files, ${failureCount} failed`)
console.log('by format:', countBy(questions, 'format'))
console.log('by difficulty:', countBy(questions, 'difficulty'))
console.log('by topic:', countBy(questions, 'topic'))
if (nearDuplicatePairs.length > 0) console.log(`\nnear-duplicate candidates (review manually):\n  ${nearDuplicatePairs.join('\n  ')}`)
process.exit(failureCount > 0 ? 1 : 0)
