import { useEffect, useState } from 'react'
import { api, errorMessage } from '../lib/api'
import { useNavigate } from '../state/navigation'
import { useJob } from '../state/jobs'
import { useToast } from '../components/toast'
import { Button } from '../components/controls'
import { ErrorPanel } from '../components/feedback'
import { JobProgressPanel } from '../components/JobProgress'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { SpecFields, specFromDraft, type SpecDraft } from '../components/SpecFields'

export function PracticePage() {
  const [draft, setDraft] = useState<SpecDraft>({ format: 'scenario', category: '', topic: '', difficulty: 'middle' })
  const [isRequesting, setIsRequesting] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useJob(jobId)
  const navigate = useNavigate()
  const showToast = useToast()

  useEffect(() => {
    void api.getSettings().then((settings) => setDraft((current) => ({ ...current, difficulty: settings.difficulty })))
  }, [])

  useEffect(() => {
    if (job?.status === 'succeeded' && job.targetId) navigate({ name: 'attempt', attemptId: job.targetId })
  }, [job, navigate])

  const request = async (): Promise<void> => {
    setIsRequesting(true)
    try {
      const result = await api.requestPractice(specFromDraft(draft))
      if (result.kind === 'ready') navigate({ name: 'attempt', attemptId: result.targetId })
      else setJobId(result.jobId)
    } catch (reason) {
      showToast({ tone: 'error', title: '문제를 받지 못했습니다', message: errorMessage(reason) })
    } finally {
      setIsRequesting(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader title="추가 풀이" description="오늘의 문제와 별도로, 원하는 조건의 문제를 더 풀 수 있습니다. 이미 받은 문제는 다시 나오지 않습니다." />
      <section className="card space-y-5 p-6">
        <SpecFields value={draft} onChange={setDraft} />
        <p className="text-xs text-slate-500">문제 은행에 조건에 맞는 문제가 있으면 바로 열리고, 없으면 새로 만듭니다(1~2분).</p>
        <Button isLoading={isRequesting} disabled={job?.status === 'running'} onClick={() => void request()}>문제 받기</Button>
      </section>
      <div className="mt-6">
        {job?.status === 'running' && <JobProgressPanel job={job} title="조건에 맞는 새 문제를 만들고 있습니다" hint="기존 문제와 겹치지 않는지도 함께 확인합니다." />}
        {job?.status === 'failed' && <ErrorPanel message={job.error ?? '문제를 만들지 못했습니다.'} detail={job.errorDetail} onRetry={() => void request()} />}
        {job?.status === 'cancelled' && <p className="text-sm text-slate-500">문제 생성을 취소했습니다.</p>}
      </div>
    </PageContainer>
  )
}
