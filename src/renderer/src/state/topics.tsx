import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import type { Topic, TopicDefinition } from '@shared/types'
import { TOPICS, topicLabel } from '@shared/taxonomy'
import { api } from '../lib/api'
import { useAsyncData } from './useAsyncData'

interface TopicsValue {
  /** Built-in and custom topics, enabled or not, in display order. */
  topics: TopicDefinition[]
  label: (value: Topic) => string
}

// Until the list loads, built-in topics keep labels and selects working.
const BUILT_IN_DEFINITIONS: TopicDefinition[] = TOPICS.map((topic) => ({ ...topic, description: '', builtIn: true, enabled: true }))

const TopicsContext = createContext<TopicsValue>({ topics: BUILT_IN_DEFINITIONS, label: topicLabel })

export function useTopics(): TopicsValue {
  return useContext(TopicsContext)
}

/** Topic options for a select; a topic left out of automatic selection is marked so the user knows why. */
export function useTopicOptions(): { value: Topic; label: string }[] {
  const { topics } = useTopics()
  return useMemo(() => topics.map((topic) => ({ value: topic.value, label: topic.enabled ? topic.label : `${topic.label} (출제 제외)` })), [topics])
}

/** Custom topics live in the data folder, so the list reloads whenever the main process reports a data change. */
export function TopicsProvider({ children }: { children: ReactNode }) {
  const { data } = useAsyncData(() => api.listTopics(), [])
  const topics = data ?? BUILT_IN_DEFINITIONS
  const label = useCallback((value: Topic) => topics.find((topic) => topic.value === value)?.label ?? topicLabel(value), [topics])
  const value = useMemo(() => ({ topics, label }), [topics, label])
  return <TopicsContext.Provider value={value}>{children}</TopicsContext.Provider>
}
