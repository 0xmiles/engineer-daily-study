import { describe, expect, it } from 'vitest'
import type { TopicConfig } from '@shared/types'
import { TOPICS } from '@shared/taxonomy'
import { EMPTY_TOPIC_CONFIG, enabledTopicValues, topicDefinitions, validateCustomTopicInput, withTopicEnabled } from './topics'

const redis = { value: 'custom-redis', label: 'Redis', description: '자료구조, 영속성, 클러스터', createdAt: '2026-11-01T00:00:00Z' }
const withRedis: TopicConfig = { disabled: [], custom: [redis] }

describe('topicDefinitions', () => {
  it('lists built-in topics first, then custom topics', () => {
    const definitions = topicDefinitions(withRedis)
    expect(definitions).toHaveLength(TOPICS.length + 1)
    expect(definitions.at(-1)).toMatchObject({ value: 'custom-redis', builtIn: false, enabled: true })
  })
})

describe('withTopicEnabled', () => {
  it('drops a disabled topic from automatic selection and brings it back when enabled again', () => {
    const disabled = withTopicEnabled(withRedis, 'kafka', false)
    expect(enabledTopicValues(disabled)).not.toContain('kafka')
    expect(enabledTopicValues(withTopicEnabled(disabled, 'kafka', true))).toContain('kafka')
  })

  it('refuses to disable the last enabled topic', () => {
    const onlyRedis: TopicConfig = { disabled: TOPICS.map((topic) => topic.value), custom: [redis] }
    expect(() => withTopicEnabled(onlyRedis, 'custom-redis', false)).toThrow('하나 이상')
  })

  it('rejects unknown topics', () => {
    expect(() => withTopicEnabled(EMPTY_TOPIC_CONFIG, 'custom-missing', false)).toThrow('알 수 없는 주제')
  })
})

describe('validateCustomTopicInput', () => {
  it('trims the input and requires a description', () => {
    expect(validateCustomTopicInput(EMPTY_TOPIC_CONFIG, { label: ' Elasticsearch ', description: ' 역색인 ' }, null)).toEqual({ label: 'Elasticsearch', description: '역색인' })
    expect(() => validateCustomTopicInput(EMPTY_TOPIC_CONFIG, { label: 'Elasticsearch', description: ' ' }, null)).toThrow('다룰 내용')
  })

  it('rejects a label another topic already uses, ignoring spaces and case, but not the topic being edited', () => {
    expect(() => validateCustomTopicInput(withRedis, { label: 're dis', description: '캐시' }, null)).toThrow('이미 있는 주제')
    expect(() => validateCustomTopicInput(withRedis, { label: '캐 시', description: '캐시' }, null)).toThrow('이미 있는 주제')
    expect(validateCustomTopicInput(withRedis, { label: 'Redis', description: '캐시' }, 'custom-redis').label).toBe('Redis')
  })
})
