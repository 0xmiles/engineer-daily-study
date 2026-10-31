import { describe, expect, it } from 'vitest'
import { CancelledError } from '../llm/processRunner'
import { SerialQueue } from './jobManager'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((settle) => (resolve = settle))
  return { promise, resolve }
}

describe('SerialQueue', () => {
  it('starts a task only after the one before it has finished', async () => {
    const queue = new SerialQueue()
    const firstGate = deferred()
    const events: string[] = []
    const first = queue.run(new AbortController().signal, async () => {
      events.push('first started')
      await firstGate.promise
      events.push('first finished')
    })
    const second = queue.run(new AbortController().signal, async () => {
      events.push('second started')
    })
    await Promise.resolve()
    firstGate.resolve()
    await Promise.all([first, second])

    expect(events).toEqual(['first started', 'first finished', 'second started'])
  })

  it('rejects a waiting task as soon as it is cancelled and never runs it, without letting the next task jump ahead', async () => {
    const queue = new SerialQueue()
    const firstGate = deferred()
    const events: string[] = []
    const first = queue.run(new AbortController().signal, async () => {
      await firstGate.promise
      events.push('first finished')
    })
    const cancelled = new AbortController()
    const waiting = queue.run(cancelled.signal, async () => {
      events.push('cancelled task ran')
    })
    const third = queue.run(new AbortController().signal, async () => {
      events.push('third started')
    })
    cancelled.abort()

    await expect(waiting).rejects.toBeInstanceOf(CancelledError)
    expect(events).toEqual([])
    firstGate.resolve()
    await Promise.all([first, third])
    expect(events).toEqual(['first finished', 'third started'])
  })
})
