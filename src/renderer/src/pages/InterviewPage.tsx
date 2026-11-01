import { useEffect, useState } from 'react'
import type { Difficulty, TimedInterviewFormat, Topic } from '@shared/types'
import type { InterviewView } from '@shared/api'
import { CONVERSATION_INTERVIEW_LIMITS, TIMED_INTERVIEW_LIMITS } from '@shared/rules'
import { DIFFICULTIES } from '@shared/taxonomy'
import { api, formatDateTime } from '../lib/api'
import { useAsyncData } from '../state/useAsyncData'
import { useNavigate } from '../state/navigation'
import { useRequest } from '../state/useRequest'
import { useTopicOptions } from '../state/topics'
import { Button, Select, Tabs } from '../components/controls'
import { EmptyState, ErrorPanel, SkeletonList } from '../components/feedback'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { InterviewBadges, interviewScore, scoreTone } from '../components/InterviewShared'

type SetupTab = 'timed' | 'conversation'

const SETUP_TABS: { value: SetupTab; label: string }[] = [
  { value: 'timed', label: '제한 시간 세션' },
  { value: 'conversation', label: '대화형 면접' },
]

const FORMAT_OPTIONS: { value: TimedInterviewFormat; label: string }[] = [
  { value: 'mixed', label: '시나리오형·개념형 번갈아' },
  { value: 'scenario', label: '시나리오형만' },
  { value: 'concept', label: '개념형만' },
]

const TIME_LIMIT_CHOICES = [5, 10, 15, 20, 30, 45, 60]

function countOptions(range: { min: number; max: number }, label: (count: number) => string): { value: string; label: string }[] {
  return Array.from({ length: range.max - range.min + 1 }, (_, index) => range.min + index).map((count) => ({ value: String(count), label: label(count) }))
}

const QUESTION_COUNT_OPTIONS = countOptions(TIMED_INTERVIEW_LIMITS.questionCount, (count) => `${count}문제`)
const TIME_LIMIT_OPTIONS = TIME_LIMIT_CHOICES
  .filter((minutes) => minutes >= TIMED_INTERVIEW_LIMITS.timeLimitMinutes.min && minutes <= TIMED_INTERVIEW_LIMITS.timeLimitMinutes.max)
  .map((minutes) => ({ value: String(minutes), label: `문제당 ${minutes}분` }))
const MAIN_QUESTION_OPTIONS = countOptions(CONVERSATION_INTERVIEW_LIMITS.mainQuestionCount, (count) => `${count}개`)
const FOLLOW_UP_OPTIONS = countOptions(CONVERSATION_INTERVIEW_LIMITS.maxFollowUps, (count) => (count === 0 ? '꼬리 질문 없음' : `질문마다 최대 ${count}개`))

/** Topic and difficulty pickers shared by both setups; difficulty starts at the default from settings. */
function useTopicAndDifficulty() {
  const [topic, setTopic] = useState<Topic | ''>('')
  const [difficulty, setDifficulty] = useState<Difficulty>('middle')
  const topicOptions = useTopicOptions()
  useEffect(() => {
    void api.getSettings().then((settings) => setDifficulty(settings.difficulty))
  }, [])
  const fields = (
    <>
      <Select label="주제" value={topic} options={topicOptions} allowEmpty="무엇이든" onChange={setTopic} />
      <Select label="난이도" value={difficulty} options={DIFFICULTIES} onChange={(value) => setDifficulty(value as Difficulty)} />
    </>
  )
  return { topicOption: topic ? { topic } : {}, difficulty, fields }
}

function TimedSetup() {
  const { topicOption, difficulty, fields } = useTopicAndDifficulty()
  const [format, setFormat] = useState<TimedInterviewFormat>('mixed')
  const [questionCount, setQuestionCount] = useState(3)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(15)
  const request = useRequest()
  const navigate = useNavigate()
  const start = async (): Promise<void> => {
    const interviewId = await request.run(() => api.startTimedInterview({ ...topicOption, difficulty, format, questionCount, timeLimitMinutes }), '면접을 시작하지 못했습니다')
    if (interviewId) navigate({ name: 'interview', interviewId })
  }
  return (
    <section className="card space-y-5 p-6">
      <p className="text-sm leading-6 text-ink-muted">
        서술형 문제를 제한 시간 안에 연달아 풉니다. 시간이 끝나면 쓴 데까지 자동으로 제출되고, 힌트는 쓸 수 없습니다. 채점 결과는 모든 문제를 마친 뒤에 한꺼번에 보여 줍니다.
      </p>
      <div className="grid grid-cols-3 gap-3">
        {fields}
        <Select label="형식" value={format} options={FORMAT_OPTIONS} onChange={(value) => setFormat((value || 'mixed') as TimedInterviewFormat)} />
        <Select label="문제 수" value={String(questionCount)} options={QUESTION_COUNT_OPTIONS} onChange={(value) => setQuestionCount(Number(value))} />
        <Select label="제한 시간" value={String(timeLimitMinutes)} options={TIME_LIMIT_OPTIONS} onChange={(value) => setTimeLimitMinutes(Number(value))} />
      </div>
      <p className="text-xs text-ink-muted">문제 은행에 맞는 문제가 없으면 새로 만든 뒤에 시작합니다(문제당 1~2분).</p>
      <Button isLoading={request.isRunning} onClick={() => void start()}>면접 시작</Button>
    </section>
  )
}

function ConversationSetup() {
  const { topicOption, difficulty, fields } = useTopicAndDifficulty()
  const [mainQuestionCount, setMainQuestionCount] = useState(3)
  const [maxFollowUps, setMaxFollowUps] = useState(2)
  const request = useRequest()
  const navigate = useNavigate()
  const start = async (): Promise<void> => {
    const interviewId = await request.run(() => api.startConversationInterview({ ...topicOption, difficulty, mainQuestionCount, maxFollowUps }), '면접을 시작하지 못했습니다')
    if (interviewId) navigate({ name: 'interview', interviewId })
  }
  return (
    <section className="card space-y-5 p-6">
      <p className="text-sm leading-6 text-ink-muted">
        면접관이 짧게 묻고, 답변에 따라 꼬리 질문을 이어 갑니다. 실제 면접처럼 짧고 핵심 있게 답하세요. 면접이 끝나면 질문별 평가와 보완할 점을 정리해 드립니다.
      </p>
      <div className="grid grid-cols-4 gap-3">
        {fields}
        <Select label="본 질문 수" value={String(mainQuestionCount)} options={MAIN_QUESTION_OPTIONS} onChange={(value) => setMainQuestionCount(Number(value))} />
        <Select label="꼬리 질문" value={String(maxFollowUps)} options={FOLLOW_UP_OPTIONS} onChange={(value) => setMaxFollowUps(Number(value))} />
      </div>
      <p className="text-xs text-ink-muted">면접관의 질문 하나마다 30초~1분 정도 걸립니다.</p>
      <Button isLoading={request.isRunning} onClick={() => void start()}>면접 시작</Button>
    </section>
  )
}

function interviewShape(interview: InterviewView): string {
  if (interview.mode === 'timed') return `${interview.items.length}문제 · 문제당 ${interview.timeLimitMinutes}분`
  return `본 질문 ${interview.mainQuestionCount}개 · 꼬리 질문 최대 ${interview.maxFollowUps}개`
}

function InterviewRow({ interview }: { interview: InterviewView }) {
  const navigate = useNavigate()
  const score = interviewScore(interview)
  return (
    <li>
      <button className="card flex w-full items-center gap-4 p-5 text-left transition hover:border-accent/40" onClick={() => navigate({ name: 'interview', interviewId: interview.id })}>
        <div className="min-w-0 flex-1">
          <InterviewBadges interview={interview} />
          <p className="mt-2 font-semibold">{interviewShape(interview)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{formatDateTime(interview.createdAt)} 시작</p>
        </div>
        {score !== null && <span className={`text-2xl font-bold tracking-tight ${scoreTone(score)}`}>{score}<span className="text-sm font-medium text-ink-faint">점</span></span>}
      </button>
    </li>
  )
}

function InterviewHistory() {
  const { data: interviews, error, isLoading, reload } = useAsyncData(() => api.listInterviews(), [])
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-ink-muted">지난 면접</h2>
      {isLoading && <SkeletonList rows={2} />}
      {error && <ErrorPanel message={error} onRetry={reload} />}
      {interviews && interviews.length === 0 && <EmptyState title="아직 본 면접이 없습니다" description="위에서 방식을 고르고 첫 모의 면접을 시작해 보세요." />}
      <ul className="space-y-2">{interviews?.map((interview) => <InterviewRow key={interview.id} interview={interview} />)}</ul>
    </section>
  )
}

export function InterviewPage() {
  const [tab, setTab] = useState<SetupTab>('timed')
  return (
    <PageContainer>
      <PageHeader title="모의 면접" description="실전처럼 시간을 재며 서술형 문제를 풀거나, 면접관과 대화하며 꼬리 질문에 답합니다." />
      <div className="mb-5"><Tabs tabs={SETUP_TABS} active={tab} onChange={setTab} /></div>
      {tab === 'timed' ? <TimedSetup /> : <ConversationSetup />}
      <InterviewHistory />
    </PageContainer>
  )
}
