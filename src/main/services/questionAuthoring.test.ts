import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QuestionSpec } from '@shared/types'
import { generateQuestion } from './questionAuthoring'
import { createTestAppContext, createTestJob, questionContentFor, removeTestDataDirectories } from './testAppContext'

const { runSkill } = vi.hoisted(() => ({ runSkill: vi.fn() }))
vi.mock('../llm/skillRunner', async () => {
  const { CancelledError } = await import('../llm/processRunner')
  return { CancelledError, RunnerError: class extends Error {}, runSkill }
})

/** Fake author that hands out the given titles in order and never calls a similar question a duplicate. */
function authorWithTitles(titles: string[]) {
  let nextTitle = 0
  runSkill.mockReset().mockImplementation(async ({ schema, payload }: { schema: string; payload: QuestionSpec }) => {
    if (schema === 'duplicate-check') return { isDuplicate: false, duplicateOfId: '', reason: '' }
    return questionContentFor(payload, titles[nextTitle++])
  })
}

const conceptSpec: QuestionSpec = { format: 'concept', difficulty: 'middle' }

afterEach(removeTestDataDirectories)

describe('generateQuestion', () => {
  it('checks a concurrent generation against the question the earlier one saved', async () => {
    authorWithTitles(['Same title', 'Same title', 'Other title'])
    const context = createTestAppContext()
    const spec: QuestionSpec = { ...conceptSpec, category: 'why', topic: 'kafka' }

    await Promise.all([generateQuestion(context, createTestJob(), { spec }), generateQuestion(context, createTestJob(), { spec })])

    expect(context.repositories().questions.readAll().map((question) => question.title).sort()).toEqual(['Other title', 'Same title'])
  })

  it('gives concurrent generations without a topic different topics', async () => {
    authorWithTitles(['First', 'Second'])
    const context = createTestAppContext()

    const [first, second] = await Promise.all([
      generateQuestion(context, createTestJob(), { spec: conceptSpec }),
      generateQuestion(context, createTestJob(), { spec: conceptSpec }),
    ])

    expect(first.topic).not.toBe(second.topic)
  })
})
