import { useEffect, useRef, useState } from 'react'
import type { Job, SelfCheckItem, StudyGuide } from '@shared/types'
import type { StudyNoteDetail, StudyNoteQuestion } from '@shared/api'
import { api, formatDateTime } from '../lib/api'
import { useAsyncData } from '../state/useAsyncData'
import { useJobs } from '../state/jobs'
import { useNavigate } from '../state/navigation'
import { useRequest } from '../state/useRequest'
import { useTopics } from '../state/topics'
import { Button } from '../components/controls'
import { EmptyState, ErrorPanel, SkeletonList, Spinner } from '../components/feedback'
import { formatDuration, useNow } from '../components/InterviewShared'
import { Markdown } from '../components/Markdown'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { Badge } from '../components/QuestionBadges'
import { DoneToggle, EarlierSources, MemoField, QuestionLink, SearchLinks, SourceLink } from '../components/StudyNoteParts'

const RUNNER_LABELS = { claude: 'Claude', codex: 'Codex' }

function useLatestGuideJob(keyword: string): Job | undefined {
  return useJobs().find((job) => job.kind === 'study-guide' && job.targetId === keyword)
}

function GuideProgress({ job, isRewriting }: { job: Job | undefined; isRewriting: boolean }) {
  const now = useNow(job !== undefined)
  const elapsed = job ? ` · ${formatDuration((now - new Date(job.startedAt).getTime()) / 1000)}` : ''
  return (
    <div className="card flex items-center gap-3 px-5 py-4 text-sm text-ink-muted">
      <Spinner size={16} className="text-accent" />
      <span>
        {isRewriting ? '학습 노트를 새로 쓰는 중' : '학습 노트를 쓰는 중'}{job && ` · ${job.stage}`}{elapsed}
        {!isRewriting && <span className="mt-0.5 block text-xs text-ink-faint">1~2분 정도 걸립니다. 다른 화면으로 가도 계속 만들고, 끝나면 알려 드립니다.</span>}
      </span>
      {job && <button className="ml-auto text-xs hover:text-bad" onClick={() => void api.cancelJob(job.id)}>취소</button>}
    </div>
  )
}

function SelfCheck({ items }: { items: SelfCheckItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="card p-6">
      <p className="font-semibold">스스로 점검</p>
      <p className="mt-0.5 text-xs text-ink-muted">답을 먼저 떠올리거나 메모에 적어 본 뒤 펼쳐서 확인하세요.</p>
      <ol className="mt-4 space-y-3">
        {items.map((item, index) => (
          <li key={index} className="rounded-xl bg-sunken px-4 py-3">
            <p className="text-sm font-medium leading-6">Q{index + 1}. {item.question}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-accent-ink">답 보기</summary>
              <Markdown text={item.answer} className="mt-2 text-sm" />
            </details>
          </li>
        ))}
      </ol>
    </section>
  )
}

function GuideView({ guide }: { guide: StudyGuide }) {
  return (
    <div className="space-y-4">
      <section className="card p-6">
        <p className="mb-2 text-xs font-semibold text-accent-ink">핵심 요약</p>
        <Markdown text={guide.summary} className="text-[15px] leading-7" />
      </section>
      {guide.sections.map((section, index) => (
        <section key={index} className="card p-6">
          <h2 className="mb-3 text-lg font-bold tracking-tight">{section.heading}</h2>
          <Markdown text={section.body} />
        </section>
      ))}
      {guide.pitfalls.length > 0 && (
        <section className="card border-l-4 border-l-warn p-6">
          <p className="mb-3 font-semibold">흔한 오해</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6">{guide.pitfalls.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>
      )}
      <SelfCheck items={guide.selfCheck} />
      {guide.relatedKeywords.length > 0 && (
        <section className="card p-6">
          <p className="mb-3 font-semibold">이어서 공부할 키워드</p>
          <SearchLinks queries={guide.relatedKeywords} />
        </section>
      )}
    </div>
  )
}

/** A cancelled rewrite is not worth a panel while the earlier guide is still there. */
function guideFailure(note: StudyNoteDetail, job: Job | undefined, hasStartFailed: boolean): { message: string; detail: string | null } | null {
  if (hasStartFailed) return { message: '학습 노트 만들기를 시작하지 못했습니다.', detail: null }
  if (job?.status === 'failed') return { message: job.error ?? '학습 노트를 만들지 못했습니다.', detail: job.errorDetail }
  if (job?.status === 'cancelled' && !note.guide) return { message: '학습 노트 만들기를 취소했습니다.', detail: null }
  return null
}

/**
 * Opening a note without material starts writing it once. A failed or cancelled run waits for the user to retry,
 * and a guide that already exists stays readable while a new one is written.
 */
function GuideArea({ note }: { note: StudyNoteDetail }) {
  const job = useLatestGuideJob(note.keyword)
  const request = useRequest()
  const hasAutoStarted = useRef(false)
  const [hasStartFailed, setHasStartFailed] = useState(false)
  const generate = async (): Promise<void> => {
    setHasStartFailed(false)
    const jobId = await request.run(() => api.generateStudyGuide(note.key), '학습 노트를 만들지 못했습니다')
    if (jobId === undefined) setHasStartFailed(true)
  }

  useEffect(() => {
    if (note.guide || job || hasAutoStarted.current) return
    hasAutoStarted.current = true
    void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.guide, job])

  const isRunning = job?.status === 'running'
  // A succeeded job is still "waiting" until the data reload brings the guide in.
  const isWaiting = isRunning || request.isRunning || (!note.guide && !hasStartFailed && (job === undefined || job.status === 'succeeded'))
  const failure = isWaiting ? null : guideFailure(note, job, hasStartFailed)

  return (
    <div className="space-y-4">
      {isWaiting && <GuideProgress job={isRunning ? job : undefined} isRewriting={Boolean(note.guide)} />}
      {failure && <ErrorPanel message={failure.message} detail={failure.detail} onRetry={() => void generate()} isRetrying={request.isRunning} />}
      {note.guide && (
        <>
          <GuideView guide={note.guide} />
          <div className="flex items-center justify-between gap-3 px-1 text-xs text-ink-faint">
            <span>{RUNNER_LABELS[note.guide.runner]}가 {formatDateTime(note.guide.generatedAt)}에 정리했습니다. 틀린 내용이 있을 수 있으니 공식 문서로 확인하세요.</span>
            <Button variant="ghost" disabled={isWaiting} onClick={() => void generate()}>다시 만들기</Button>
          </div>
        </>
      )}
    </div>
  )
}

function noteDescription(note: StudyNoteDetail): string {
  const parts = [
    note.lastRecommendedAt && `추천 ${note.sources.length}회 · 마지막 추천 ${formatDateTime(note.lastRecommendedAt)}`,
    note.questions.length > 0 && `문제 ${note.questions.length}개에 필요한 개념`,
  ]
  return parts.filter(Boolean).join(' · ')
}

function NeededByQuestions({ questions }: { questions: StudyNoteQuestion[] }) {
  return (
    <section className="card p-5">
      <p className="text-xs font-semibold text-accent-ink">이 개념이 필요한 문제</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {questions.map((question) => <li key={question.id}><QuestionLink question={question} /></li>)}
      </ul>
    </section>
  )
}

function NoteContent({ note }: { note: StudyNoteDetail }) {
  const { label: topicLabel } = useTopics()
  const [latestSource, ...earlierSources] = note.sources
  return (
    <>
      <PageHeader title={note.keyword} description={noteDescription(note)} actions={<DoneToggle note={note} />} />
      <div className="-mt-5 mb-6 flex flex-wrap gap-1.5">
        {note.isReopened && <Badge className="bg-warn-soft text-warn">다시 추천됨</Badge>}
        {note.topics.map((topic) => <Badge key={topic}>{topicLabel(topic)}</Badge>)}
      </div>
      <div className="space-y-4">
        {latestSource && (
          <section className="card border-l-4 border-l-accent p-5">
            <p className="text-xs font-semibold text-accent-ink">추천 이유</p>
            <p className="mt-1 text-sm leading-6">{latestSource.reason}</p>
            <SourceLink source={latestSource} />
            <EarlierSources sources={earlierSources} />
          </section>
        )}
        {note.questions.length > 0 && <NeededByQuestions questions={note.questions} />}
      </div>
      <div className="mt-6"><GuideArea note={note} /></div>
      <section className="card mt-6 p-5">
        <p className="mb-3 font-semibold">내 메모</p>
        <MemoField note={note} />
      </section>
      <section className="mt-6">
        <p className="mb-2 text-xs font-semibold text-ink-muted">더 찾아보기</p>
        <SearchLinks queries={note.sources.map((source) => source.searchQuery)} />
      </section>
    </>
  )
}

export function StudyNotePage({ keyword }: { keyword: string }) {
  const navigate = useNavigate()
  const { data: note, error, isLoading, reload } = useAsyncData(() => api.getStudyNote(keyword), [keyword])
  return (
    <PageContainer>
      <button className="mb-4 text-sm text-ink-muted hover:text-accent-ink" onClick={() => navigate({ name: 'notes' })}>← 학습 노트</button>
      {isLoading && !note && <SkeletonList />}
      {error && <ErrorPanel message={error} onRetry={reload} />}
      {!isLoading && !error && !note && (
        <EmptyState
          title="학습 노트를 찾을 수 없습니다"
          description="이 키워드를 추천한 채점 결과나 면접 기록, 또는 이 키워드가 필요한 문제가 지워졌을 수 있습니다."
          action={<Button onClick={() => navigate({ name: 'notes' })}>학습 노트 목록</Button>}
        />
      )}
      {note && <NoteContent note={note} />}
    </PageContainer>
  )
}
