import { useState } from 'react'
import type { QuestionCategory, Topic } from '@shared/types'
import { categoriesOf } from '@shared/taxonomy'
import { api, errorMessage } from '../lib/api'
import { useToast } from '../components/toast'
import { Button } from '../components/controls'
import { SpecFields, type SpecDraft } from '../components/SpecFields'

const DEFAULT_LENGTH = { min: 500, max: 1000 }

function parseRequirements(text: string): string[] {
  return text.split('\n').map((line) => line.replace(/^\s*(\d+[.)]|[-*])\s*/, '').trim()).filter(Boolean)
}

/** The user writes the statement; the question author skill drafts the rubric and model answer. */
export function ManualQuestionForm({ onDone }: { onDone: () => void }) {
  const [draft, setDraft] = useState<SpecDraft>({ format: 'scenario', category: categoriesOf('scenario')[0].value, topic: 'kotlin-spring', difficulty: 'middle' })
  const [title, setTitle] = useState('')
  const [situation, setSituation] = useState('')
  const [requirementsText, setRequirementsText] = useState('')
  const [length, setLength] = useState(DEFAULT_LENGTH)
  const [isSaving, setIsSaving] = useState(false)
  const showToast = useToast()
  const requirements = parseRequirements(requirementsText)
  const isComplete = Boolean(title.trim() && situation.trim() && requirements.length > 0 && draft.category && draft.topic)

  const save = async (): Promise<void> => {
    setIsSaving(true)
    try {
      const spec = { format: draft.format, category: draft.category as QuestionCategory, topic: draft.topic as Topic, difficulty: draft.difficulty }
      await api.createManualQuestion({ spec, title: title.trim(), situation: situation.trim(), requirements, recommendedLength: length })
      showToast({ tone: 'info', title: '채점 기준 작성을 시작했습니다', message: '완료되면 문제 은행에 추가됩니다.' })
      onDone()
    } catch (reason) {
      showToast({ tone: 'error', title: '문제를 추가하지 못했습니다', message: errorMessage(reason) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="card space-y-5 p-6">
      <SpecFields value={draft} onChange={setDraft} allowAny={false} />
      <label className="block"><span className="label">제목</span><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 정산 배치가 두 번 실행되는 문제" /></label>
      <label className="block"><span className="label">상황 (마크다운)</span><textarea className="input h-48 font-mono" value={situation} onChange={(event) => setSituation(event.target.value)} placeholder="수치, 환경, 제약, 관찰된 증상을 구체적으로 쓰세요." /></label>
      <label className="block"><span className="label">요구 사항 (한 줄에 하나)</span><textarea className="input h-28" value={requirementsText} onChange={(event) => setRequirementsText(event.target.value)} placeholder={'원인 후보를 세 가지 이상 제시하세요.\n조사 순서와 그 이유를 쓰세요.'} /></label>
      <div className="grid w-80 grid-cols-2 gap-3">
        <label><span className="label">권장 최소 글자 수</span><input type="number" className="input" value={length.min} onChange={(event) => setLength({ ...length, min: Number(event.target.value) })} /></label>
        <label><span className="label">권장 최대 글자 수</span><input type="number" className="input" value={length.max} onChange={(event) => setLength({ ...length, max: Number(event.target.value) })} /></label>
      </div>
      <p className="text-xs text-slate-500">저장하면 LLM이 채점 기준과 모범 답안을 작성합니다. 입력한 제목, 상황, 요구 사항은 그대로 유지됩니다.</p>
      <Button disabled={!isComplete} isLoading={isSaving} onClick={() => void save()}>저장하고 채점 기준 작성</Button>
    </section>
  )
}
