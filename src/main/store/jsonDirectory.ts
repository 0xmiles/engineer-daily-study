import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Antivirus scanners and OneDrive briefly lock files on Windows, which makes rename fail with these codes.
const TRANSIENT_LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RENAME_ATTEMPTS = 5
const RENAME_RETRY_BASE_MILLISECONDS = 50

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function isTransientLock(error: unknown): boolean {
  return TRANSIENT_LOCK_CODES.has((error as NodeJS.ErrnoException).code ?? '')
}

function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      return renameSync(from, to)
    } catch (error) {
      if (!isTransientLock(error) || attempt === RENAME_ATTEMPTS) throw error
      sleepSync(RENAME_RETRY_BASE_MILLISECONDS * attempt)
    }
  }
}

/** Writes through a temp file and rename so a crash never leaves half a file. */
function writeJsonAtomically(path: string, value: unknown): void {
  const temporaryPath = `${path}.tmp`
  writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8')
  renameWithRetry(temporaryPath, path)
}

/** A directory of `<key>.json` files. Writes go through a temp file and rename so a crash never leaves half a file. */
export class JsonDirectory<T> {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true })
  }

  read(key: string): T | null {
    const path = this.pathOf(key)
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf8')) as T
  }

  /** Skips unreadable files so one hand-edited or corrupted file does not take every list screen down. */
  readAll(): T[] {
    return this.keys()
      .map((key) => this.readOrSkip(key))
      .filter((value): value is T => value !== null)
  }

  write(key: string, value: T): void {
    writeJsonAtomically(this.pathOf(key), value)
  }

  remove(key: string): void {
    rmSync(this.pathOf(key), { force: true })
  }

  keys(): string[] {
    return readdirSync(this.directory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length))
  }

  private readOrSkip(key: string): T | null {
    try {
      return this.read(key)
    } catch (error) {
      console.warn(`Skipping unreadable file ${this.pathOf(key)}:`, error)
      return null
    }
  }

  private pathOf(key: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`Invalid storage key: ${key}`)
    return join(this.directory, `${key}.json`)
  }
}

/** One JSON file, written the same crash-safe way as the entries of a JsonDirectory. */
export class JsonFile<T> {
  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true })
  }

  read(): T | null {
    if (!existsSync(this.path)) return null
    return JSON.parse(readFileSync(this.path, 'utf8')) as T
  }

  write(value: T): void {
    writeJsonAtomically(this.path, value)
  }
}
