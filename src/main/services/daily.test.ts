import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job, QuestionSpec } from '@shared/types'
import type { AppContext } from './appContext'
import { ensureDailySet, prepareDaily, retryDailyItem, todayKey } from './daily'
import { createTestAppContext, questionContentFor, removeTestDataDirectories } from './testAppContext'

const { runSkill } = vi.hoisted(() => ({ runSkill: vi.fn() }))
vi.mock('../llm/skillRunner', async () => {
  const { CancelledError } = await import('../llm/processRunner')
  return { CancelledError, RunnerError: class extends Error {}, runSkill }
})

/**
 * Fake author whose n-th question (1-based) fails when listed in failingCalls.
 * With five daily items, calls 1 to 5 fill today and calls 6 to 10 prepare tomorrow.
 */
function authorFailingOn(failingCalls: number[], beforeCall: (call: number) => void = () => {}) {
  let call = 0
  runSkill.mockReset().mockImplementation(async ({ schema, payload }: { schema: string; payload: QuestionSpec }) => {
    if (schema === 'duplicate-check') return { isDuplicate: false, duplicateOfId: '', reason: '' }
    call++
    beforeCall(call)
    if (failingCalls.includes(call)) throw new Error(`generation ${call} failed`)
    return questionContentFor(payload, `Generated question number ${call} ${'x'.repeat(call * 7)}`)
  })
}

async function runPrepareDaily(context: AppContext): Promise<Job> {
  prepareDaily(context)
  await vi.waitFor(() => {
    if (context.jobs.isRunning('prepare-daily')) throw new Error('still preparing')
  })
  return context.jobs.list()[0]
}

function todayItems(context: AppContext) {
  return context.repositories().dailySets.read(todayKey())!.items
}

afterEach(removeTestDataDirectories)

describe('prepareDaily', () => {
  it('fails with the number of today items it could not generate and keeps each item error', async () => {
    authorFailingOn([1])
    const context = createTestAppContext()

    const job = await runPrepareDaily(context)

    expect(job.status).toBe('failed')
    expect(job.error).toContain('1개')
    expect(todayItems(context)[0].generationError).toBe('generation 1 failed')
    expect(todayItems(context)[1].questionId).not.toBeNull()
  })

  it('succeeds when only preparing tomorrow fails', async () => {
    authorFailingOn([6])
    const context = createTestAppContext()

    const job = await runPrepareDaily(context)

    expect(job.status).toBe('succeeded')
    expect(todayItems(context).every((item) => item.questionId)).toBe(true)
  })

  it('generates an item retried while the job is still running', async () => {
    const context = createTestAppContext()
    authorFailingOn([1], (call) => {
      if (call === 6) retryDailyItem(context, todayKey(), 0)
    })

    const job = await runPrepareDaily(context)

    expect(job.status).toBe('succeeded')
    expect(todayItems(context)[0]).toMatchObject({ generationError: null })
    expect(todayItems(context)[0].questionId).not.toBeNull()
    expect(context.jobs.list().filter((listed) => listed.kind === 'prepare-daily')).toHaveLength(1)
  })
})

describe('ensureDailySet', () => {
  it('adds short answer items to a set planned before short answers existed, keeping its other items', () => {
    const context = createTestAppContext()
    const essayItem = { kind: 'scenario', questionId: null, spec: { format: 'scenario', category: 'incident-diagnosis', topic: 'kafka', difficulty: 'middle' }, variantOfAttemptId: null, attemptId: null, generationError: null } as const
    context.repositories().saveDailySet({ date: todayKey(), items: [essayItem] })

    const items = ensureDailySet(context, todayKey()).items

    expect(items[0]).toEqual(essayItem)
    expect(items.slice(1).map((item) => item.kind)).toEqual(['short-answer', 'short-answer', 'short-answer'])
    expect(todayItems(context)).toHaveLength(4)
  })

  it('leaves a set that already has short answer items unchanged', () => {
    const context = createTestAppContext()
    const first = ensureDailySet(context, todayKey())

    expect(ensureDailySet(context, todayKey())).toEqual(first)
  })
})
