import type { CustomTopic, Topic, TopicConfig, TopicDefinition } from '@shared/types'
import type { CustomTopicInput } from '@shared/api'
import { TOPICS } from '@shared/taxonomy'

export const EMPTY_TOPIC_CONFIG: TopicConfig = { disabled: [], custom: [] }

const MAX_LABEL_LENGTH = 30
const MAX_DESCRIPTION_LENGTH = 500

/** Built-in topics in taxonomy order, then custom topics in the order they were added. */
export function topicDefinitions(config: TopicConfig): TopicDefinition[] {
  const isEnabled = (value: Topic): boolean => !config.disabled.includes(value)
  return [
    ...TOPICS.map((topic) => ({ value: topic.value, label: topic.label, description: '', builtIn: true, enabled: isEnabled(topic.value) })),
    ...config.custom.map((topic) => ({ value: topic.value, label: topic.label, description: topic.description, builtIn: false, enabled: isEnabled(topic.value) })),
  ]
}

/** Never empty: if every topic ended up disabled (a hand-edited file), selection falls back to all of them. */
export function enabledTopicValues(config: TopicConfig): Topic[] {
  const definitions = topicDefinitions(config)
  const enabled = definitions.filter((topic) => topic.enabled)
  return (enabled.length > 0 ? enabled : definitions).map((topic) => topic.value)
}

export function topicLabelOf(config: TopicConfig, value: Topic): string {
  return topicDefinitions(config).find((topic) => topic.value === value)?.label ?? value
}

export function customTopicOf(config: TopicConfig, value: Topic): CustomTopic | null {
  return config.custom.find((topic) => topic.value === value) ?? null
}

/** Trimmed input, or an error message the settings screen can show. */
export function validateCustomTopicInput(config: TopicConfig, input: CustomTopicInput, editingValue: Topic | null): CustomTopicInput {
  const label = input.label.trim()
  const description = input.description.trim()
  if (!label) throw new Error('주제 이름을 입력하세요.')
  if (label.length > MAX_LABEL_LENGTH) throw new Error(`주제 이름은 ${MAX_LABEL_LENGTH}자 이하로 입력하세요.`)
  if (!description) throw new Error('이 주제에서 다룰 내용을 입력하세요. 문제를 만들 때 출제 범위로 쓰입니다.')
  if (description.length > MAX_DESCRIPTION_LENGTH) throw new Error(`다룰 내용은 ${MAX_DESCRIPTION_LENGTH}자 이하로 입력하세요.`)
  const normalized = label.replace(/\s+/g, '').toLowerCase()
  const isTaken = topicDefinitions(config).some((topic) => topic.value !== editingValue && topic.label.replace(/\s+/g, '').toLowerCase() === normalized)
  if (isTaken) throw new Error(`이미 있는 주제 이름입니다: ${label}`)
  return { label, description }
}

export function withTopicEnabled(config: TopicConfig, value: Topic, enabled: boolean): TopicConfig {
  const definitions = topicDefinitions(config)
  if (!definitions.some((topic) => topic.value === value)) throw new Error(`알 수 없는 주제입니다: ${value}`)
  const disabled = enabled ? config.disabled.filter((entry) => entry !== value) : [...new Set([...config.disabled, value])]
  if (definitions.every((topic) => disabled.includes(topic.value))) throw new Error('출제할 주제를 하나 이상 남겨 두세요.')
  return { ...config, disabled }
}
