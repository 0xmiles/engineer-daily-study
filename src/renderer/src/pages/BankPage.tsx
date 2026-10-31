import { useMemo, useState } from 'react'
import type { Question, QuestionFormat, Topic } from '@shared/types'
import { FORMATS, TOPICS } from '@shared/taxonomy'
import { api, errorMessage } from '../lib/api'
import { useAsyncData } from '../state/useAsyncData'
import { useNavigate } from '../state/navigation'
import { useToast } from '../components/toast'
import { Button, Select, Tabs } from '../components/controls'
import { EmptyState, ErrorPanel, SkeletonList } from '../components/feedback'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { QuestionBadges } from '../components/QuestionBadges'
import { SpecFields, specFromDraft, type SpecDraft } from '../components/SpecFields'
import { ManualQuestionForm } from './ManualQuestionForm'

type BankTab = 'list' | 'generate' | 'manual'

function GenerateForm({ onDone }: { onDone: () => void }) {
  const [draft, setDraft] = useState<SpecDraft>({ format: 'scenario', category: '', topic: '', difficulty: 'middle' })
  const [count, setCount] = useState(1)
  const [isStarting, setIsStarting] = useState(false)
  const showToast = useToast()
  const start = async (): Promise<void> => {
    setIsStarting(true)
    try {
      await api.generateQuestions(specFromDraft(draft), count)
      showToast({ tone: 'info', title: `문제 ${count}개 생성을 시작했습니다`, message: '진행 상황은 상단 작업 표시에서 볼 수 있습니다.' })
      onDone()
    } catch (reason) {
      showToast({ tone: 'error', title: '생성을 시작하지 못했습니다', message: errorMessage(reason) })
    } finally {
      setIsStarting(false)
    }
  }
  return (
    <section className="card space-y-5 p-6">
      <SpecFields value={draft} onChange={setDraft} />
      <label className="block w-40">
        <span className="label">개수 (최대 5)</span>
        <input type="number" min={1} max={5} className="input" value={count} onChange={(event) => setCount(Math.min(5, Math.max(1, Number(event.target.value))))} />
      </label>
      <p className="text-xs text-slate-500">생성한 문제는 검수 대기 상태로 문제 은행에 추가되고, 출제 피드백이 반영됩니다.</p>
      <Button isLoading={isStarting} onClick={() => void start()}>생성 시작</Button>
    </section>
  )
}

function QuestionList({ questions }: { questions: Question[] }) {
  const [format, setFormat] = useState<QuestionFormat | ''>('')
  const [topic, setTopic] = useState<Topic | ''>('')
  const [servedFilter, setServedFilter] = useState<'all' | 'served' | 'unserved'>('all')
  const navigate = useNavigate()
  const visible = useMemo(() => questions.filter((question) =>
    (!format || question.format === format) &&
    (!topic || question.topic === topic) &&
    (servedFilter === 'all' || (servedFilter === 'served') === Boolean(question.servedAt)),
  ), [questions, format, topic, servedFilter])
  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Select label="형식" value={format} options={FORMATS} allowEmpty="전체" onChange={setFormat} />
        <Select label="주제" value={topic} options={TOPICS} allowEmpty="전체" onChange={setTopic} />
        <Select label="출제 여부" value={servedFilter} options={[{ value: 'all', label: '전체' }, { value: 'unserved', label: '아직 출제 안 됨' }, { value: 'served', label: '출제됨' }]} onChange={(value) => setServedFilter((value || 'all') as typeof servedFilter)} />
      </div>
      <p className="mb-2 text-xs text-slate-500">{visible.length}개 문제</p>
      {visible.length === 0 && <EmptyState title="조건에 맞는 문제가 없습니다" description="필터를 바꾸거나 새 문제를 생성하세요." />}
      <ul className="space-y-2">
        {visible.map((question) => (
          <li key={question.id}>
            <button className="card flex w-full items-center gap-4 p-4 text-left transition hover:border-indigo-300" onClick={() => navigate({ name: 'question', questionId: question.id })}>
              <div className="min-w-0 flex-1">
                <QuestionBadges question={question} showSource />
                <p className="mt-1.5 truncate font-semibold">{question.title}</p>
              </div>
              <span className="text-xs text-slate-500">{question.servedAt ? '출제됨' : '대기'}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

export function BankPage() {
  const [tab, setTab] = useState<BankTab>('list')
  const { data: questions, error, isLoading, reload } = useAsyncData(() => api.listQuestions(), [])
  return (
    <PageContainer>
      <PageHeader title="문제 은행" description="출제에 쓰이는 문제를 관리합니다. 문제를 직접 추가하거나 LLM에게 생성을 맡길 수 있습니다." />
      <div className="mb-5">
        <Tabs tabs={[{ value: 'list', label: '문제 목록' }, { value: 'generate', label: 'LLM으로 생성' }, { value: 'manual', label: '직접 추가' }]} active={tab} onChange={setTab} />
      </div>
      {tab === 'list' && isLoading && <SkeletonList />}
      {tab === 'list' && error && <ErrorPanel message={error} onRetry={reload} />}
      {tab === 'list' && questions && <QuestionList questions={questions} />}
      {tab === 'generate' && <GenerateForm onDone={() => setTab('list')} />}
      {tab === 'manual' && <ManualQuestionForm onDone={() => setTab('list')} />}
    </PageContainer>
  )
}
