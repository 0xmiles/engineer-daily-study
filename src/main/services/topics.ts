import type { CustomTopic, Topic, TopicConfig, TopicDefinition } from '@shared/types'
import type { CustomTopicInput } from '@shared/api'
import { EMPTY_TOPIC_CONFIG, customTopicOf, topicDefinitions, topicLabelOf, validateCustomTopicInput, withTopicEnabled } from '../domain/topics'
import { newId, type Repositories } from '../store/repositories'
import type { AppContext } from './appContext'

// A damaged file only loses the user's topic choices; it must not stop questions from being served.
export function readTopicConfig(repositories: Repositories): TopicConfig {
  try {
    const saved = repositories.topicConfig.read()
    return { disabled: saved?.disabled ?? [], custom: saved?.custom ?? [] }
  } catch {
    return EMPTY_TOPIC_CONFIG
  }
}

export function listTopics(repositories: Repositories): TopicDefinition[] {
  return topicDefinitions(readTopicConfig(repositories))
}

export function topicLabelIn(repositories: Repositories, value: Topic): string {
  return topicLabelOf(readTopicConfig(repositories), value)
}

export function customTopicIn(repositories: Repositories, value: Topic): CustomTopic | null {
  return customTopicOf(readTopicConfig(repositories), value)
}

function saveTopicConfig(context: AppContext, config: TopicConfig): void {
  context.repositories().topicConfig.write(config)
  context.notifyDataChanged()
}

function requireCustomTopic(config: TopicConfig, value: Topic): CustomTopic {
  const topic = customTopicOf(config, value)
  if (!topic) throw new Error('직접 추가한 주제만 고치거나 지울 수 있습니다.')
  return topic
}

export function setTopicEnabled(context: AppContext, value: Topic, enabled: boolean): void {
  saveTopicConfig(context, withTopicEnabled(readTopicConfig(context.repositories()), value, enabled))
}

export function addCustomTopic(context: AppContext, input: CustomTopicInput): TopicDefinition {
  const config = readTopicConfig(context.repositories())
  const topic: CustomTopic = { ...validateCustomTopicInput(config, input, null), value: newId('custom'), createdAt: new Date().toISOString() }
  saveTopicConfig(context, { ...config, custom: [...config.custom, topic] })
  return topicDefinitions(readTopicConfig(context.repositories())).find((definition) => definition.value === topic.value)!
}

export function updateCustomTopic(context: AppContext, value: Topic, input: CustomTopicInput): void {
  const config = readTopicConfig(context.repositories())
  const topic = requireCustomTopic(config, value)
  const changes = validateCustomTopicInput(config, input, value)
  saveTopicConfig(context, { ...config, custom: config.custom.map((entry) => (entry === topic ? { ...entry, ...changes } : entry)) })
}

/** Questions keep their topic id forever, so a topic with questions can only be turned off, never deleted. */
export function deleteCustomTopic(context: AppContext, value: Topic): void {
  const repositories = context.repositories()
  const config = readTopicConfig(repositories)
  requireCustomTopic(config, value)
  if (repositories.questions.readAll().some((question) => question.topic === value)) {
    throw new Error('이 주제로 만든 문제가 있어 지울 수 없습니다. 출제에서 빼려면 주제를 끄세요.')
  }
  const remaining: TopicConfig = { disabled: config.disabled.filter((entry) => entry !== value), custom: config.custom.filter((entry) => entry.value !== value) }
  if (topicDefinitions(remaining).every((topic) => !topic.enabled)) throw new Error('출제할 주제를 하나 이상 남겨 두세요.')
  saveTopicConfig(context, remaining)
}
