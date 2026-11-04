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

  it('stores a short answer question in the fixed shape whatever the model returned', async () => {
    const content = questionContentFor({ format: 'short-answer', category: 'term-definition', topic: 'kafka', difficulty: 'middle' }, 'Short answer')
    runSkill.mockReset().mockResolvedValue({
      ...content,
      requirements: ['extra requirement'],
      recommendedLength: { min: 300, max: 600 },
      rubric: {
        ...content.rubric,
        required: [{ point: 'first', explanation: '' }, { point: 'second', explanation: '' }],
        bonus: [{ point: 'bonus', explanation: '' }],
        deductions: [{ point: 'deduction', explanation: '' }],
      },
      perspectives: ['정확성'],
    })
    const context = createTestAppContext()

    const question = await generateQuestion(context, createTestJob(), { spec: { format: 'short-answer', category: 'term-definition', topic: 'kafka', difficulty: 'middle' } })

    expect(question).toMatchObject({ requirements: [], recommendedLength: { min: 1, max: 150 }, perspectives: [] })
    expect(question.rubric).toMatchObject({ required: [{ point: 'first' }], bonus: [], deductions: [] })
  })

  it('rejects a short answer question without a rubric item', async () => {
    const spec: QuestionSpec = { format: 'short-answer', category: 'term-definition', topic: 'kafka', difficulty: 'middle' }
    const content = questionContentFor(spec, 'No rubric')
    runSkill.mockReset().mockResolvedValue({ ...content, rubric: { ...content.rubric, required: [] } })

    await expect(generateQuestion(createTestAppContext(), createTestJob(), { spec })).rejects.toThrow('채점 기준')
  })

  it('writes the question again when it comes back with a code block', async () => {
    const spec: QuestionSpec = { ...conceptSpec, category: 'why', topic: 'kafka' }
    const withCode = { ...questionContentFor(spec, 'With code'), situation: '```kotlin\nfun main() {}\n```' }
    runSkill.mockReset().mockResolvedValueOnce(withCode).mockResolvedValueOnce(questionContentFor(spec, 'Prose only'))

    const question = await generateQuestion(createTestAppContext(), createTestJob(), { spec })

    expect(question.title).toBe('Prose only')
    expect(runSkill.mock.calls[1][0].payload.rejectedForCode).toEqual(['With code'])
  })

  it('gives up with a code specific message when every round has a code block', async () => {
    const spec: QuestionSpec = { ...conceptSpec, category: 'why', topic: 'kafka' }
    runSkill.mockReset().mockResolvedValue({ ...questionContentFor(spec, 'With code'), requirements: ['```sql\nSELECT 1\n```'] })

    await expect(generateQuestion(createTestAppContext(), createTestJob(), { spec })).rejects.toThrow('코드가 없는 문제')
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
