import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JsonDirectory } from './jsonDirectory'

describe('JsonDirectory', () => {
  const directories: string[] = []
  const newDirectory = (): string => {
    const directory = mkdtempSync(join(tmpdir(), 'json-directory-'))
    directories.push(directory)
    return directory
  }
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('reads every valid file and skips a corrupted one', () => {
    const directory = newDirectory()
    const store = new JsonDirectory<{ value: number }>(directory)
    store.write('first', { value: 1 })
    writeFileSync(join(directory, 'broken.json'), '{ not json', 'utf8')
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(store.readAll()).toEqual([{ value: 1 }])
  })

  it('still reports a corrupted file when it is read directly', () => {
    const directory = newDirectory()
    writeFileSync(join(directory, 'broken.json'), '{ not json', 'utf8')
    expect(() => new JsonDirectory(directory).read('broken')).toThrow()
  })
})
