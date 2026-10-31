import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { CancelledError, runProcess, type ProcessRequest } from './processRunner'

function nodeScript(script: string, overrides: Partial<ProcessRequest> = {}): ProcessRequest {
  return {
    executable: process.execPath,
    args: ['-e', script],
    stdin: '',
    cwd: tmpdir(),
    env: process.env,
    signal: new AbortController().signal,
    ...overrides,
  }
}

describe('runProcess', () => {
  it('keeps multi-byte characters intact when they straddle output chunks', async () => {
    // Writes the 3 bytes of '한' in two separate writes so the decoder sees a split character.
    const script = "const b=Buffer.from('한');process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.write(b.subarray(1)),50)"
    const result = await runProcess(nodeScript(script))
    expect(result.stdout).toBe('한')
  })

  it('does not crash when the child exits before reading a large stdin', async () => {
    const result = await runProcess(nodeScript('process.exit(3)', { stdin: 'x'.repeat(4 * 1024 * 1024) }))
    expect(result.exitCode).toBe(3)
  })

  it('rejects immediately on abort without waiting for the child to finish', async () => {
    const controller = new AbortController()
    const started = Date.now()
    const running = runProcess(nodeScript('setTimeout(()=>{},30000)', { signal: controller.signal }))
    setTimeout(() => controller.abort(), 100)
    await expect(running).rejects.toBeInstanceOf(CancelledError)
    expect(Date.now() - started).toBeLessThan(5000)
  })
})
