import { useState } from 'react'
import type { Attempt, Hint } from '@shared/types'
import { HINT_PENALTY, MAX_HINTS, POSTPONE_DAYS } from '@shared/rules'
import { api } from '../lib/api'
import { useRunningJob } from '../state/jobs'
import { useRequest } from '../state/useRequest'
import { Button, ConfirmDialog } from './controls'
import { Spinner } from './feedback'
import { Markdown } from './Markdown'

const LEVEL_LABELS = ['방향', '핵심 개념', '구체적 단서']

export function hintLevelLabel(level: number): string {
  return LEVEL_LABELS[level - 1] ?? `${level}단계`
}

export function HintList({ hints }: { hints: Hint[] }) {
  return (
    <ol className="space-y-3">
      {hints.map((hint) => (
        <li key={hint.level} className="rounded-xl bg-sunken px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-accent-ink">힌트 {hint.level} · {hintLevelLabel(hint.level)}</p>
          <Markdown text={hint.text} className="text-sm" />
        </li>
      ))}
    </ol>
  )
}

function HintProgress({ attemptId }: { attemptId: string }) {
  const job = useRunningJob('hint', attemptId)
  if (!job) return null
  return (
    <div className="flex items-center gap-2 text-xs text-ink-muted">
      <Spinner size={12} className="text-accent" /> 힌트를 만드는 중 · {job.stage}
      <button className="ml-auto hover:text-bad" onClick={() => void api.cancelJob(job.id)}>취소</button>
    </div>
  )
}

interface HintPanelProps {
  attempt: Attempt
  answer: string
  isSubmitting: boolean
  onPostpone: () => Promise<void>
}

/** Up to MAX_HINTS hints, each costing points; once they run out the question can be put off for a few days. */
export function HintPanel({ attempt, answer, isSubmitting, onPostpone }: HintPanelProps) {
  const hints = attempt.hints ?? []
  const isGenerating = useRunningJob('hint', attempt.id) !== undefined
  const hintRequest = useRequest()
  const postponeRequest = useRequest()
  const [dialog, setDialog] = useState<'hint' | 'postpone' | null>(null)
  if (attempt.origin === 'interview') return null

  const remaining = MAX_HINTS - hints.length
  const requestHint = (): void => {
    setDialog(null)
    void hintRequest.run(() => api.requestHint(attempt.id, answer), '힌트를 요청하지 못했습니다')
  }
  const postpone = (): void => {
    setDialog(null)
    void postponeRequest.run(onPostpone, '미루지 못했습니다')
  }

  return (
    <section className="card mt-8 space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">힌트</p>
          <p className="mt-0.5 text-xs text-ink-muted">{hints.length}/{MAX_HINTS}회 사용 · 1회당 {HINT_PENALTY}점 감점</p>
        </div>
        {remaining > 0 && (
          <Button variant="secondary" isLoading={hintRequest.isRunning || isGenerating} disabled={isSubmitting} onClick={() => setDialog('hint')}>
            힌트 받기
          </Button>
        )}
      </div>
      <HintProgress attemptId={attempt.id} />
      {hints.length > 0 && <HintList hints={hints} />}
      {remaining === 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
          <p className="text-sm text-ink-muted">힌트를 모두 받았습니다. 그래도 막히면 나중에 다시 풀 수 있습니다.</p>
          <Button variant="secondary" className="shrink-0" isLoading={postponeRequest.isRunning} disabled={isSubmitting} onClick={() => setDialog('postpone')}>
            나중에 다시 풀기
          </Button>
        </div>
      )}
      <ConfirmDialog
        isOpen={dialog === 'hint'}
        title={`힌트 ${hints.length + 1}을 받을까요?`}
        description={`${hintLevelLabel(hints.length + 1)} 수준의 힌트를 지금까지 쓴 답안에 맞춰 만듭니다. 총점에서 ${HINT_PENALTY}점이 빠지고, 힌트는 ${remaining}번 남아 있습니다.`}
        confirmLabel="힌트 받기"
        onConfirm={requestHint}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        isOpen={dialog === 'postpone'}
        title="나중에 다시 풀까요?"
        description={`지금까지 쓴 답안과 힌트는 풀이 기록에 남고, ${POSTPONE_DAYS}일 뒤 이 문제가 오늘의 문제로 다시 나옵니다. 그때는 힌트를 다시 ${MAX_HINTS}번 받을 수 있습니다.`}
        confirmLabel="나중에 다시 풀기"
        onConfirm={postpone}
        onCancel={() => setDialog(null)}
      />
    </section>
  )
}
