import { useEffect, useState } from 'react'
import type { RunnerStatus } from '@shared/api'
import type { Difficulty, RunnerKind, Settings } from '@shared/types'
import { DAILY_SHORT_ANSWER_COUNT } from '@shared/rules'
import { DIFFICULTIES } from '@shared/taxonomy'
import { api } from '../lib/api'
import { useAsyncData } from '../state/useAsyncData'
import { useJob } from '../state/jobs'
import { useRequest } from '../state/useRequest'
import { useToast } from '../components/toast'
import { Button, Select } from '../components/controls'
import { ErrorPanel, PageLoading, Spinner } from '../components/feedback'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { ThemeToggle } from '../components/ThemeToggle'
import { TopicSettings } from '../components/TopicSettings'
import { ReminderFields } from '../components/ReminderFields'

const RUNNERS: { value: RunnerKind; label: string }[] = [
  { value: 'claude', label: 'Claude Code (claude -p)' },
  { value: 'codex', label: 'Codex (codex exec)' },
]

const DAILY_COUNT_OPTIONS: { value: '2' | '3'; label: string }[] = [
  { value: '2', label: '2문제 (시나리오 1 + 개념 1)' },
  { value: '3', label: '3문제 (개념 1문제 추가)' },
]

function RunnerLocation({ label, path }: { label: string; path: string | null }) {
  return <li>{label}: {path ?? <span className="text-bad">찾을 수 없음</span>}</li>
}

function RunnerTest() {
  const [jobId, setJobId] = useState<string | null>(null)
  const [runners, setRunners] = useState<RunnerStatus | null>(null)
  const job = useJob(jobId)
  const testRequest = useRequest()
  const startTest = async (): Promise<void> => {
    const startedJobId = await testRequest.run(() => api.testRunner(), '연결 테스트를 시작하지 못했습니다')
    if (startedJobId) setJobId(startedJobId)
  }
  useEffect(() => {
    void api.locateRunners().then(setRunners)
  }, [job?.status])
  const isTestRunning = job?.status === 'running'
  return (
    <section className="card space-y-3 p-6">
      <p className="font-semibold">실행기 연결 상태</p>
      {!runners ? <PageLoading label="CLI 위치를 찾는 중" /> : (
        <ul className="space-y-1 text-sm">
          <RunnerLocation label="Claude Code" path={runners.claude} />
          <RunnerLocation label="Codex" path={runners.codex} />
        </ul>
      )}
      <div className="flex items-center gap-3">
        <Button variant="secondary" isLoading={testRequest.isRunning || isTestRunning} onClick={() => void startTest()}>연결 테스트</Button>
        {isTestRunning && <span className="flex items-center gap-1 text-xs text-ink-muted"><Spinner size={12} /> {job.stage}</span>}
        {job?.status === 'succeeded' && <span className="text-sm text-good">연결되었습니다. 출제와 채점을 사용할 수 있습니다.</span>}
      </div>
      {job?.status === 'failed' && <ErrorPanel message={job.error ?? '연결 테스트에 실패했습니다.'} detail={job.errorDetail} />}
    </section>
  )
}

function DataDirectoryField({ value, onChange }: { value: string; onChange: (dataDirectory: string) => void }) {
  const chooseRequest = useRequest()
  const choose = async (): Promise<void> => {
    const chosen = await chooseRequest.run(() => api.chooseDataDirectory(), '폴더를 선택하지 못했습니다')
    if (chosen) onChange(chosen)
  }
  return (
    <div>
      <label htmlFor="data-directory" className="label">데이터 폴더 (문제, 풀이, 피드백 저장 위치)</label>
      <div className="flex gap-2">
        <input id="data-directory" className="input" value={value} onChange={(event) => onChange(event.target.value)} />
        <Button variant="secondary" className="shrink-0" isLoading={chooseRequest.isRunning} onClick={() => void choose()}>폴더 선택</Button>
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">폴더를 바꾸면 기존 기록은 옮겨지지 않습니다. 기존 폴더의 파일을 새 폴더로 직접 복사해야 합니다.</p>
    </div>
  )
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}

/** Keeps an editable copy of the saved settings; the copy is replaced whenever the saved settings reload. */
function useSettingsDraft() {
  const { data: saved, error, isLoading, reload } = useAsyncData(() => api.getSettings(), [])
  const [draft, setDraft] = useState<Settings | null>(null)
  const saveRequest = useRequest()
  const showToast = useToast()
  useEffect(() => {
    if (saved) setDraft(saved)
  }, [saved])

  // The theme is saved the moment it is picked, so the draft's copy may be stale and must not overwrite it.
  const save = async (): Promise<void> => {
    const { theme: _theme, ...changes } = draft!
    const savedSettings = await saveRequest.run(() => api.saveSettings(changes), '설정을 저장하지 못했습니다')
    if (!savedSettings) return
    setDraft(savedSettings)
    showToast({ tone: 'success', title: '설정을 저장했습니다', message: '난이도와 문제 수는 내일 문제부터 적용됩니다.' })
  }
  const update = (changes: Partial<Settings>): void => setDraft({ ...draft!, ...changes })
  return { draft, error, isLoading, reload, isSaving: saveRequest.isRunning, save, update }
}

export function SettingsPage() {
  const { draft, error, isLoading, reload, isSaving, save, update } = useSettingsDraft()
  if (isLoading || !draft) return <PageContainer>{error ? <ErrorPanel message={error} onRetry={reload} /> : <PageLoading />}</PageContainer>
  return (
    <PageContainer>
      <PageHeader title="설정" />
      <section className="card space-y-5 p-6">
        <div className="grid grid-cols-3 gap-3">
          <Select label="LLM 실행기" value={draft.runner} options={RUNNERS} onChange={(runner) => update({ runner: runner as RunnerKind })} />
          <Select label="기본 난이도" value={draft.difficulty} options={DIFFICULTIES} onChange={(difficulty) => update({ difficulty: difficulty as Difficulty })} />
          <Select label="하루 서술형 문제 수" value={String(draft.dailyCount) as '2' | '3'} options={DAILY_COUNT_OPTIONS} onChange={(count) => update({ dailyCount: Number(count) as 2 | 3 })} />
        </div>
        <p className="text-xs text-ink-muted">단답형 {DAILY_SHORT_ANSWER_COUNT}문제는 서술형 문제와 별도로 매일 함께 나옵니다.</p>
        <TextField label="모델 (비워 두면 CLI 기본 모델)" value={draft.model} onChange={(model) => update({ model })} placeholder="예: opus, sonnet, gpt-5" />
        <TextField label="Claude Code 실행 파일 경로 (비워 두면 자동 탐색)" value={draft.claudePath} onChange={(claudePath) => update({ claudePath })} />
        <TextField label="Codex 실행 파일 경로 (비워 두면 자동 탐색)" value={draft.codexPath} onChange={(codexPath) => update({ codexPath })} />
        <DataDirectoryField value={draft.dataDirectory} onChange={(dataDirectory) => update({ dataDirectory })} />
        <ReminderFields value={draft} onChange={update} />
        <Button isLoading={isSaving} onClick={() => void save()}>저장</Button>
      </section>
      <TopicSettings />
      <section className="card mt-6 flex items-center justify-between gap-6 p-6">
        <div>
          <p className="font-semibold">화면 테마</p>
          <p className="mt-1 text-xs text-ink-muted">고르는 즉시 적용됩니다. 시스템을 고르면 OS 설정을 따릅니다.</p>
        </div>
        <ThemeToggle className="w-64 shrink-0" />
      </section>
      <div className="mt-6"><RunnerTest /></div>
    </PageContainer>
  )
}
