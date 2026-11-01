import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import type { Settings } from '@shared/types'
import { DIFFICULTIES } from '@shared/taxonomy'

export function defaultSettings(documentsDirectory: string): Settings {
  return {
    runner: 'claude',
    difficulty: 'middle',
    dailyCount: 2,
    dataDirectory: join(documentsDirectory, 'DailyStudy'),
    claudePath: '',
    codexPath: '',
    model: '',
    theme: 'system',
    reminderEnabled: true,
    reminderTime: '09:00',
    launchAtLogin: false,
  }
}

const THEMES: readonly unknown[] = ['light', 'dark', 'system'] satisfies Settings['theme'][]

// Windows `.cmd` wrappers re-expand their arguments, so the model name must not carry shell metacharacters,
// and a leading dash would be read by the CLI as another option.
const MODEL_NAME_PATTERN = /^(?!-)[A-Za-z0-9._:/[\]-]*$/

const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const isBoolean = (value: unknown): boolean => typeof value === 'boolean'

const isOptionalAbsolutePath = (value: unknown): boolean => value === '' || (typeof value === 'string' && isAbsolute(value))

const SETTING_RULES: { [Key in keyof Settings]: { isValid: (value: unknown) => boolean; message: string } } = {
  runner: { isValid: (value) => value === 'claude' || value === 'codex', message: '실행기는 claude 또는 codex 여야 합니다.' },
  difficulty: { isValid: (value) => DIFFICULTIES.some((entry) => entry.value === value), message: '난이도 값이 올바르지 않습니다.' },
  dailyCount: { isValid: (value) => value === 2 || value === 3, message: '하루 문제 수는 2 또는 3 이어야 합니다.' },
  dataDirectory: { isValid: (value) => typeof value === 'string' && isAbsolute(value), message: '데이터 폴더는 절대 경로여야 합니다.' },
  claudePath: { isValid: isOptionalAbsolutePath, message: 'Claude Code 실행 파일 경로는 비워 두거나 절대 경로로 입력하세요.' },
  codexPath: { isValid: isOptionalAbsolutePath, message: 'Codex 실행 파일 경로는 비워 두거나 절대 경로로 입력하세요.' },
  model: {
    isValid: (value) => typeof value === 'string' && MODEL_NAME_PATTERN.test(value),
    message: '모델 이름에는 영문, 숫자와 . _ : / - [ ] 만 쓸 수 있고, - 로 시작할 수 없습니다.',
  },
  theme: { isValid: (value) => THEMES.includes(value), message: '화면 테마는 light, dark, system 중 하나여야 합니다.' },
  reminderEnabled: { isValid: isBoolean, message: '알림 사용 여부 값이 올바르지 않습니다.' },
  reminderTime: {
    isValid: (value) => typeof value === 'string' && REMINDER_TIME_PATTERN.test(value),
    message: '알림 시각은 00:00부터 23:59 사이의 HH:MM 형식으로 입력하세요.',
  },
  launchAtLogin: { isValid: isBoolean, message: '로그인할 때 실행 여부 값이 올바르지 않습니다.' },
}

function isSettingKey(key: string): key is keyof Settings {
  return Object.hasOwn(SETTING_RULES, key)
}

/** Rejects unknown keys and invalid values from the renderer with a message the settings page can show. */
export function validateSettingsChanges(changes: unknown): Partial<Settings> {
  if (typeof changes !== 'object' || changes === null) throw new Error('설정 형식이 올바르지 않습니다.')
  for (const [key, value] of Object.entries(changes)) {
    if (!isSettingKey(key)) throw new Error(`알 수 없는 설정 항목입니다: ${key}`)
    if (!SETTING_RULES[key].isValid(value)) throw new Error(SETTING_RULES[key].message)
  }
  return changes as Partial<Settings>
}

/** Drops unknown or invalid entries from a hand-edited settings file instead of refusing to start. */
export function keepValidSettings(saved: unknown): Partial<Settings> {
  if (typeof saved !== 'object' || saved === null) return {}
  return Object.fromEntries(
    Object.entries(saved).filter(([key, value]) => isSettingKey(key) && SETTING_RULES[key].isValid(value)),
  ) as Partial<Settings>
}

function readSavedSettings(filePath: string): Partial<Settings> {
  if (!existsSync(filePath)) return {}
  try {
    return keepValidSettings(JSON.parse(readFileSync(filePath, 'utf8')))
  } catch {
    return {}
  }
}

/** Settings live in the app's userData folder because they include the data folder location itself. */
export class SettingsStore {
  private current: Settings

  constructor(private readonly filePath: string, private readonly defaults: Settings) {
    this.current = { ...defaults, ...readSavedSettings(filePath) }
  }

  get(): Settings {
    return { ...this.current }
  }

  getDefaults(): Settings {
    return { ...this.defaults }
  }

  /** Applies changes for this run only, so the saved choice is tried again on the next launch. */
  overrideForThisRun(changes: Partial<Settings>): Settings {
    this.current = { ...this.current, ...changes }
    return this.get()
  }

  update(changes: Partial<Settings>): Settings {
    this.current = { ...this.current, ...changes }
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.current, null, 2), 'utf8')
    return this.get()
  }
}
