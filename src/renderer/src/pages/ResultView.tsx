import { useState } from 'react'
import type { Attempt, Question, ScoredGrading } from '@shared/types'
import { api, errorMessage, formatDateTime } from '../lib/api'
import { useNavigate } from '../state/navigation'
import { useToast } from '../components/toast'
import { Button, Tabs } from '../components/controls'
import { Markdown } from '../components/Markdown'
import { PageContainer } from '../components/PageHeader'
import { QuestionStatement } from '../components/QuestionStatement'
import { QuestionFeedbackForm } from '../components/QuestionFeedbackForm'
import { RubricView } from '../components/RubricView'
import { DiscussionSection } from '../components/DiscussionSection'
import { HintList } from '../components/HintPanel'
import { StudyRecommendationList } from '../components/StudyRecommendationList'

type ResultTab = 'weaknesses' | 'strengths' | 'model' | 'compare' | 'rubric' | 'study'

const RESULT_TABS: { value: ResultTab; label: string }[] = [
  { value: 'weaknesses', label: '부족한 점' },
  { value: 'strengths', label: '잘한 점' },
  { value: 'model', label: '모범 답안' },
  { value: 'compare', label: '내 답안 비교' },
  { value: 'rubric', label: '채점 상세' },
  { value: 'study', label: '추가 학습' },
]

function scoreTone(score: number): string {
  if (score >= 80) return 'text-good'
  if (score >= 60) return 'text-info'
  return 'text-bad'
}

function Quote({ text }: { text: string }) {
  if (!text) return null
  return <blockquote className="mt-2 border-l-[3px] border-line-strong pl-3 text-sm text-ink-muted">“{text}”</blockquote>
}

function hintSummary(attempt: Attempt, grading: ScoredGrading): string | null {
  const hintCount = attempt.hints?.length ?? 0
  if (hintCount === 0) return null
  return grading.hintPenalty ? `힌트 ${hintCount}회 사용 (−${grading.hintPenalty}점)` : `힌트 ${hintCount}회 사용`
}

function ScoreHeader({ attempt, grading }: { attempt: Attempt; grading: ScoredGrading }) {
  const fullCount = grading.requiredCoverage.filter((item) => item.status === 'full').length
  const details = [`필수 항목 ${fullCount}/${grading.requiredCoverage.length} 충족`, hintSummary(attempt, grading), `${formatDateTime(grading.gradedAt)} 채점`]
  return (
    <section className="card p-7">
      <div className="flex items-end gap-8">
        <div>
          <p className={`text-5xl font-bold tracking-tight ${scoreTone(grading.totalScore)}`}>{grading.totalScore}<span className="text-xl font-medium text-ink-faint"> / 100</span></p>
          <p className="mt-1 text-sm text-ink-muted">{details.filter(Boolean).join(' · ')}</p>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2">
          {grading.perspectiveScores.map((item) => (
            <div key={item.perspective}>
              <div className="flex justify-between text-xs"><span>{item.perspective}</span><span className="font-semibold">{item.score}/10</span></div>
              <div className="mt-1.5 h-1.5 rounded-full bg-sunken"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${item.score * 10}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-5 text-[15px] leading-7">{grading.overallComment}</p>
    </section>
  )
}

function TabContent({ tab, attempt, question }: { tab: ResultTab; attempt: Attempt; question: Question }) {
  const grading = attempt.grading!
  switch (tab) {
    case 'weaknesses':
      return <ul className="space-y-4">{grading.weaknesses.map((item, index) => (
        <li key={index} className="card p-4"><p className="font-semibold">{item.summary}</p><Quote text={item.quote} /><p className="mt-2 text-sm"><span className="font-semibold text-accent-ink">보완 방법</span> {item.improvement}</p></li>
      ))}</ul>
    case 'strengths':
      return <ul className="space-y-4">{grading.strengths.map((item, index) => (
        <li key={index} className="card p-4"><p className="font-semibold">{item.summary}</p><Quote text={item.quote} /></li>
      ))}</ul>
    case 'model':
      return <div className="card p-6"><Markdown text={question.modelAnswer} /></div>
    case 'compare':
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-5"><p className="label">내 답안</p><Markdown text={attempt.answer} /></div>
          <div className="card p-5"><p className="label">모범 답안</p><Markdown text={question.modelAnswer} /></div>
        </div>
      )
    case 'rubric':
      return (
        <div className="space-y-4">
          <RubricView question={question} grading={grading} />
          {(attempt.hints ?? []).length > 0 && <section className="card p-6"><h3 className="mb-3 text-sm font-semibold">받은 힌트</h3><HintList hints={attempt.hints ?? []} /></section>}
        </div>
      )
    case 'study':
      return <StudyRecommendationList items={grading.studyRecommendations} />
  }
}

export function ResultView({ attempt, question }: { attempt: Attempt; question: Question }) {
  const [tab, setTab] = useState<ResultTab>('weaknesses')
  const [isRetrying, setIsRetrying] = useState(false)
  const navigate = useNavigate()
  const showToast = useToast()

  const solveAgain = async (): Promise<void> => {
    setIsRetrying(true)
    try {
      navigate({ name: 'attempt', attemptId: await api.startAttempt(question.id, 'practice') })
    } catch (reason) {
      showToast({ tone: 'error', title: '다시 풀기를 시작하지 못했습니다', message: errorMessage(reason) })
      setIsRetrying(false)
    }
  }

  return (
    <PageContainer wide>
      <details className="card mb-4 p-5">
        <summary className="cursor-pointer font-semibold">문제 다시 보기: {question.title}</summary>
        <div className="mt-4"><QuestionStatement question={question} /></div>
      </details>
      <ScoreHeader attempt={attempt} grading={attempt.grading!} />
      <div className="mt-6"><Tabs tabs={RESULT_TABS} active={tab} onChange={setTab} /></div>
      <div className="mt-4"><TabContent tab={tab} attempt={attempt} question={question} /></div>
      <DiscussionSection attempt={attempt} question={question} />
      <section className="card mt-8 p-5">
        <p className="mb-3 font-semibold">이 문제는 어땠나요?</p>
        <QuestionFeedbackForm questionId={question.id} />
      </section>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" isLoading={isRetrying} onClick={() => void solveAgain()}>같은 문제 다시 풀기</Button>
        <Button onClick={() => navigate({ name: 'today' })}>오늘의 문제로</Button>
      </div>
    </PageContainer>
  )
}
