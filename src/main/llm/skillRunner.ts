import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Ajv, { type ValidateFunction } from 'ajv'
import type { Settings } from '@shared/types'
import { childProcessPath, locateRunner } from './cliLocator'
import { CancelledError, TimeoutError, runProcess, type ProcessResult } from './processRunner'
import { readSchema, readSkillDocuments, schemaPath, type SchemaName, type SkillName } from './resources'

const MAX_ATTEMPTS = 2
const DETAIL_TAIL_LENGTH = 4000

export interface SkillRunRequest {
  skill: SkillName
  schema: SchemaName
  payload: object
  settings: Settings
  signal: AbortSignal
  onStage: (stage: string) => void
}

/** Failure with a readable message for the UI and raw CLI output for the collapsible detail panel. */
export class RunnerError extends Error {
  constructor(message: string, readonly detail: string) {
    super(message)
  }
}

const validators = new Map<SchemaName, ValidateFunction>()
function validatorFor(schema: SchemaName): ValidateFunction {
  if (!validators.has(schema)) validators.set(schema, new Ajv({ allErrors: true }).compile(readSchema(schema)))
  return validators.get(schema)!
}

function buildPrompt(skill: SkillName, payload: object): string {
  return [
    '당신은 아래 skill 문서를 따르는 작업자입니다. 문서를 모두 읽고 규칙을 그대로 지키세요.',
    '도구를 사용하지 말고, 지정된 JSON Schema 형식의 결과 하나만 출력하세요.',
    `<skill name="${skill}">\n${readSkillDocuments(skill)}\n</skill>`,
    `<request>\n${JSON.stringify(payload, null, 2)}\n</request>`,
  ].join('\n\n')
}

function tail(text: string): string {
  return text.length > DETAIL_TAIL_LENGTH ? text.slice(-DETAIL_TAIL_LENGTH) : text
}

async function requireExecutable(settings: Settings): Promise<string> {
  const configuredPath = settings.runner === 'claude' ? settings.claudePath : settings.codexPath
  const executable = await locateRunner(settings.runner, configuredPath)
  if (executable) return executable
  const name = settings.runner === 'claude' ? 'Claude Code' : 'Codex'
  throw new RunnerError(`${name} CLI를 찾을 수 없습니다. 설치 여부를 확인하거나 설정에서 실행 파일 경로를 지정하세요.`, '')
}

function failure(result: ProcessResult, message: string): RunnerError {
  return new RunnerError(message, tail(`exit code: ${result.exitCode}\n\n[stderr]\n${result.stderr}\n\n[stdout]\n${result.stdout}`))
}

async function runClaude(executable: string, request: SkillRunRequest, prompt: string, env: NodeJS.ProcessEnv): Promise<unknown> {
  const schemaText = JSON.stringify(readSchema(request.schema))
  const args = ['-p', '--output-format', 'json', '--json-schema', schemaText, '--tools', '', '--setting-sources', '', '--no-session-persistence']
  if (request.settings.model) args.push('--model', request.settings.model)
  const result = await runProcess({ executable, args, stdin: prompt, cwd: tmpdir(), env, signal: request.signal })
  let envelope: { is_error?: boolean; result?: string; structured_output?: unknown }
  try {
    envelope = JSON.parse(result.stdout)
  } catch {
    throw failure(result, 'Claude Code 실행 결과를 읽을 수 없습니다. 로그인 상태를 확인하세요.')
  }
  if (envelope.is_error) throw failure(result, `Claude Code 오류: ${envelope.result ?? '알 수 없는 오류'}`)
  return envelope.structured_output ?? JSON.parse(envelope.result ?? '')
}

async function runCodex(executable: string, request: SkillRunRequest, prompt: string, env: NodeJS.ProcessEnv): Promise<unknown> {
  const workingDirectory = mkdtempSync(join(tmpdir(), 'daily-study-codex-'))
  const outputFile = join(workingDirectory, 'last-message.json')
  const args = ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', workingDirectory, '--output-schema', schemaPath(request.schema), '-o', outputFile]
  if (request.settings.model) args.push('-m', request.settings.model)
  args.push('-')
  try {
    const result = await runProcess({ executable, args, stdin: prompt, cwd: workingDirectory, env, signal: request.signal })
    if (!existsSync(outputFile)) throw failure(result, 'Codex가 결과를 만들지 못했습니다. 로그인 상태를 확인하세요.')
    return JSON.parse(readFileSync(outputFile, 'utf8'))
  } finally {
    removeWorkingDirectory(workingDirectory)
  }
}

// After a cancel or timeout the killed CLI may still hold this folder on Windows; a failed cleanup must not replace that error.
function removeWorkingDirectory(workingDirectory: string): void {
  try {
    rmSync(workingDirectory, { recursive: true, force: true })
  } catch (error) {
    console.warn(`Could not remove ${workingDirectory}:`, error)
  }
}

function validated<T>(schema: SchemaName, value: unknown): T {
  const validate = validatorFor(schema)
  if (validate(value)) return value as T
  const errors = (validate.errors ?? []).map((error) => `${error.instancePath} ${error.message}`).join('\n')
  throw new RunnerError('모델 응답이 형식에 맞지 않습니다.', tail(`${errors}\n\n${JSON.stringify(value, null, 2)}`))
}

async function runOnce<T>(request: SkillRunRequest, executable: string, env: NodeJS.ProcessEnv): Promise<T> {
  const prompt = buildPrompt(request.skill, request.payload)
  request.onStage('모델 응답을 기다리는 중')
  const raw = request.settings.runner === 'claude'
    ? await runClaude(executable, request, prompt, env)
    : await runCodex(executable, request, prompt, env)
  request.onStage('결과를 검증하는 중')
  return validated<T>(request.schema, raw)
}

/** Cancellation and timeouts are final; a second ten-minute wait would only double the delay. */
function isRetryable(error: unknown): boolean {
  return !(error instanceof CancelledError || error instanceof TimeoutError)
}

/** Runs a skill headlessly and returns schema-validated JSON, retrying once on malformed output. */
export async function runSkill<T>(request: SkillRunRequest): Promise<T> {
  request.onStage('요청을 준비하는 중')
  const executable = await requireExecutable(request.settings)
  const env = { ...process.env, PATH: await childProcessPath() }
  let lastError: unknown = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await runOnce<T>(request, executable, env)
    } catch (error) {
      if (!isRetryable(error)) throw error
      lastError = error
    }
  }
  throw lastError
}

export { CancelledError }
