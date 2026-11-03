import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QuestionSpec } from '@shared/types'
import { TOPICS } from '@shared/taxonomy'
import { ensureDailySet, todayKey } from './daily'
import { generateQuestion } from './questionAuthoring'
import { addCustomTopic, deleteCustomTopic, listTopics, setTopicEnabled } from './topics'
import { createTestAppContext, createTestJob, questionContentFor, removeTestDataDirectories } from './testAppContext'

const { runSkill } = vi.hoisted(() => ({ runSkill: vi.fn() }))
vi.mock('../llm/skillRunner', async () => {
  const { CancelledError } = await import('../llm/processRunner')
  return { CancelledError, RunnerError: class extends Error {}, runSkill }
})

function authorEchoingSpec() {
  let call = 0
  runSkill.mockReset().mockImplementation(async ({ schema, payload }: { schema: string; payload: QuestionSpec }) => {
    if (schema === 'duplicate-check') return { isDuplicate: false, duplicateOfId: '', reason: '' }
    return questionContentFor(payload, `Generated ${++call} ${'x'.repeat(call * 9)}`)
  })
}

const redisInput = { label: 'Redis', description: '자료구조, 영속성, 클러스터' }

afterEach(removeTestDataDirectories)

describe('custom topics', () => {
  it('sends the custom topic scope to the question author', async () => {
    authorEchoingSpec()
    const context = createTestAppContext()
    const redis = addCustomTopic(context, redisInput)

    const question = await generateQuestion(context, createTestJob(), { spec: { format: 'concept', category: 'why', topic: redis.value, difficulty: 'middle' } })

    expect(question.topic).toBe(redis.value)
    expect(runSkill.mock.calls[0][0].payload).toMatchObject({ topic: redis.value, customTopic: { label: 'Redis', description: '자료구조, 영속성, 클러스터' } })
  })

  it('can be deleted only while no question uses it', async () => {
    authorEchoingSpec()
    const context = createTestAppContext()
    const unused = addCustomTopic(context, { label: 'Elasticsearch', description: '역색인' })
    const used = addCustomTopic(context, redisInput)
    await generateQuestion(context, createTestJob(), { spec: { format: 'concept', category: 'why', topic: used.value, difficulty: 'middle' } })

    deleteCustomTopic(context, unused.value)
    expect(() => deleteCustomTopic(context, used.value)).toThrow('지울 수 없습니다')
    expect(listTopics(context.repositories()).map((topic) => topic.value)).not.toContain(unused.value)
  })

  it('keeps disabled topics out of the daily set', () => {
    const context = createTestAppContext()
    const redis = addCustomTopic(context, redisInput)
    for (const topic of TOPICS) setTopicEnabled(context, topic.value, false)

    const dailySet = ensureDailySet(context, todayKey())

    expect(dailySet.items.map((item) => item.spec.topic)).toEqual(Array(5).fill(redis.value))
  })
})
