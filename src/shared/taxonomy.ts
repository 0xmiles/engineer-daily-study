import taxonomyJson from '../../schemas/taxonomy.json'
import type {
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
}

export const FORMATS = taxonomyJson.formats as { value: QuestionFormat; label: string }[]
export const CATEGORIES = taxonomyJson.categories as CategoryDefinition[]
export const TOPICS = taxonomyJson.topics as { value: Topic; label: string }[]
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

export function categoriesOf(format: QuestionFormat): CategoryDefinition[] {
  return CATEGORIES.filter((category) => category.format === format)
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

export function topicLabel(value: Topic): string {
  return TOPICS.find((entry) => entry.value === value)?.label ?? value
}

export function difficultyLabel(value: Difficulty): string {
  return DIFFICULTIES.find((entry) => entry.value === value)?.label ?? value
}
