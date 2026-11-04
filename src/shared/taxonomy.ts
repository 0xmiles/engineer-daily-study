import taxonomyJson from '../../schemas/taxonomy.json'
import type {
  BuiltInTopic,
  Difficulty,
  QuestionCategory,
  QuestionFeedbackReason,
  QuestionFormat,
  QuestionSource,
  ScenarioCategory,
  Topic,
} from './types'

interface CategoryDefinition {
  value: QuestionCategory
  label: string
  format: QuestionFormat
  perspectives: string[]
  /** Set on a category no longer offered; new questions that would have used it use this one instead. */
  retiredFor?: QuestionCategory
}

export const FORMATS = taxonomyJson.formats as { value: QuestionFormat; label: string }[]
/** Includes retired categories, so questions and attempts saved under them still show their label. */
export const CATEGORIES = taxonomyJson.categories as CategoryDefinition[]
/** Categories new questions, filters for them and feedback scopes can use. */
export const ACTIVE_CATEGORIES = CATEGORIES.filter((category) => !category.retiredFor)
/** Built-in topics only; custom topics come from the data folder through listTopics. */
export const TOPICS = taxonomyJson.topics as { value: BuiltInTopic; label: string }[]
export const DIFFICULTIES = taxonomyJson.difficulties as { value: Difficulty; label: string }[]
const SCENARIO_ROTATION = taxonomyJson.scenarioRotationByWeekday as Record<string, ScenarioCategory>

export const FEEDBACK_REASONS: { value: QuestionFeedbackReason; label: string }[] = [
  { value: 'ambiguous', label: '모호함' },
  { value: 'too-easy', label: '너무 쉬움' },
  { value: 'too-hard', label: '너무 어려움' },
  { value: 'unrealistic', label: '비현실적' },
  { value: 'rubric-error', label: '채점 기준 오류' },
  { value: 'similar-to-existing', label: '기존 문제와 비슷함' },
]

export const SOURCE_LABELS: Record<QuestionSource, string> = {
  seed: '기본 문제',
  generated: 'LLM 생성',
  variant: '약점 변형',
  manual: '직접 입력',
}

export function isShortAnswer(question: { format: QuestionFormat }): boolean {
  return question.format === 'short-answer'
}

export function categoriesOf(format: QuestionFormat): CategoryDefinition[] {
  return ACTIVE_CATEGORIES.filter((category) => category.format === format)
}

/** The category a new question should use in place of the given one, e.g. a variant of a retired-category question. */
export function activeCategoryOf(category: QuestionCategory): QuestionCategory {
  return CATEGORIES.find((entry) => entry.value === category)?.retiredFor ?? category
}

export function perspectivesOf(category: QuestionCategory): string[] {
  return CATEGORIES.find((entry) => entry.value === category)?.perspectives ?? []
}

export function scenarioCategoryForWeekday(weekday: number): ScenarioCategory {
  return SCENARIO_ROTATION[String(weekday)]
}

export function formatLabel(value: QuestionFormat): string {
  return FORMATS.find((entry) => entry.value === value)?.label ?? value
}

export function categoryLabel(value: QuestionCategory): string {
  return CATEGORIES.find((entry) => entry.value === value)?.label ?? value
}

/** Built-in label; a custom topic needs its definition (useTopics on screens, topicLabelOf in the main process). */
export function topicLabel(value: Topic): string {
  return TOPICS.find((entry) => entry.value === value)?.label ?? value
}

export function difficultyLabel(value: Difficulty): string {
  return DIFFICULTIES.find((entry) => entry.value === value)?.label ?? value
}
