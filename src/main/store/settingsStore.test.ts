import { describe, expect, it } from 'vitest'
import { keepValidSettings, validateSettingsChanges } from './settingsStore'

describe('validateSettingsChanges', () => {
  it('accepts known keys with valid values', () => {
    const changes = { runner: 'codex', dailyCount: 3, model: 'claude-opus-5-5[1m]', claudePath: '' }
    expect(validateSettingsChanges(changes)).toEqual(changes)
  })

  it('rejects unknown keys', () => {
    expect(() => validateSettingsChanges({ shell: '/bin/sh' })).toThrow('알 수 없는 설정 항목')
  })

  it('rejects out-of-range values', () => {
    expect(() => validateSettingsChanges({ dailyCount: 9 })).toThrow('하루 문제 수')
    expect(() => validateSettingsChanges({ runner: 'bash' })).toThrow('실행기')
  })

  it('rejects model names that a Windows .cmd wrapper could treat as commands', () => {
    expect(() => validateSettingsChanges({ model: 'sonnet & calc.exe' })).toThrow('모델 이름')
    expect(() => validateSettingsChanges({ model: 'x%PATH%' })).toThrow('모델 이름')
  })

  it('rejects relative executable and data paths', () => {
    expect(() => validateSettingsChanges({ claudePath: 'claude' })).toThrow('Claude Code')
    expect(() => validateSettingsChanges({ dataDirectory: 'data' })).toThrow('데이터 폴더')
  })
})

describe('keepValidSettings', () => {
  it('keeps valid entries and drops invalid or unknown ones', () => {
    expect(keepValidSettings({ runner: 'codex', dailyCount: 7, extra: true })).toEqual({ runner: 'codex' })
  })

  it('returns nothing for a non-object file', () => {
    expect(keepValidSettings('broken')).toEqual({})
  })
})

describe('model name option guard', () => {
  it('rejects a model name that the CLI would read as another option', () => {
    expect(() => validateSettingsChanges({ model: '--dangerously-skip-permissions' })).toThrow('모델 이름')
  })
})
