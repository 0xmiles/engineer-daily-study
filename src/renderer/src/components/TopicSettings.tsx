import { useState } from 'react'
import type { TopicDefinition } from '@shared/types'
import type { CustomTopicInput } from '@shared/api'
import { api } from '../lib/api'
import { useTopics } from '../state/topics'
import { useRequest } from '../state/useRequest'
import { useToast } from './toast'
import { Button, ConfirmDialog } from './controls'
import { Badge } from './QuestionBadges'

const EMPTY_INPUT: CustomTopicInput = { label: '', description: '' }

function TopicForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: CustomTopicInput
  submitLabel: string
  onSubmit: (input: CustomTopicInput) => Promise<boolean>
  onCancel?: () => void
}) {
  const [input, setInput] = useState(initial)
  const [isSaving, setIsSaving] = useState(false)
  const submit = async (): Promise<void> => {
    setIsSaving(true)
    const isSaved = await onSubmit(input)
    setIsSaving(false)
    if (isSaved && !onCancel) setInput(EMPTY_INPUT)
  }
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label">주제 이름</span>
        <input className="input" value={input.label} maxLength={30} onChange={(event) => setInput({ ...input, label: event.target.value })} placeholder="예: Redis" />
      </label>
      <label className="block">
        <span className="label">다룰 내용 (문제를 만들 때 출제 범위로 쓰입니다)</span>
        <textarea className="input h-20" value={input.description} maxLength={500} onChange={(event) => setInput({ ...input, description: event.target.value })} placeholder="예: 자료구조와 시간 복잡도, RDB·AOF 영속성, 클러스터와 슬롯 재분배, 분산 락, 메모리 정책" />
      </label>
      <div className="flex gap-2">
        <Button variant="secondary" isLoading={isSaving} disabled={!input.label.trim() || !input.description.trim()} onClick={() => void submit()}>{submitLabel}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>취소</Button>}
      </div>
    </div>
  )
}

function TopicRow({ topic }: { topic: TopicDefinition }) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const toggleRequest = useRequest()
  const deleteRequest = useRequest()
  const editRequest = useRequest()
  const showToast = useToast()

  const save = async (input: CustomTopicInput): Promise<boolean> => {
    const result = await editRequest.run(async () => { await api.updateCustomTopic(topic.value, input); return true }, '주제를 고치지 못했습니다')
    if (result) {
      setIsEditing(false)
      showToast({ tone: 'success', title: '주제를 고쳤습니다' })
    }
    return Boolean(result)
  }
  const remove = (): void => {
    setIsDeleteConfirmOpen(false)
    void deleteRequest.run(() => api.deleteCustomTopic(topic.value), '주제를 지우지 못했습니다')
  }

  if (isEditing) {
    return <li className="py-4"><TopicForm initial={{ label: topic.label, description: topic.description }} submitLabel="저장" onSubmit={save} onCancel={() => setIsEditing(false)} /></li>
  }
  return (
    <li className="flex items-start gap-4 py-3">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-accent"
          checked={topic.enabled}
          disabled={toggleRequest.isRunning}
          onChange={(event) => void toggleRequest.run(() => api.setTopicEnabled(topic.value, event.target.checked), '주제 설정을 바꾸지 못했습니다')}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-medium">
            {topic.label}
            {!topic.builtIn && <Badge>직접 추가</Badge>}
          </span>
          {topic.description && <span className="mt-0.5 block text-xs leading-5 text-ink-muted">{topic.description}</span>}
        </span>
      </label>
      {!topic.builtIn && (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" onClick={() => setIsEditing(true)}>고치기</Button>
          <Button variant="ghost" isLoading={deleteRequest.isRunning} onClick={() => setIsDeleteConfirmOpen(true)}>지우기</Button>
        </div>
      )}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title={`'${topic.label}' 주제를 지울까요?`}
        description="이 주제로 만든 문제가 있으면 지울 수 없습니다. 그럴 때는 체크를 해제해 출제에서 빼세요."
        confirmLabel="지우기"
        tone="danger"
        onConfirm={remove}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />
    </li>
  )
}

/** Each change is saved at once, separately from the settings form above. */
export function TopicSettings() {
  const { topics } = useTopics()
  const addRequest = useRequest()
  const showToast = useToast()
  const add = async (input: CustomTopicInput): Promise<boolean> => {
    const added = await addRequest.run(() => api.addCustomTopic(input), '주제를 추가하지 못했습니다')
    if (added) showToast({ tone: 'success', title: `'${added.label}' 주제를 추가했습니다`, message: '이 주제의 문제는 문제 은행에 없으므로 LLM이 새로 만듭니다.' })
    return Boolean(added)
  }
  return (
    <section className="card mt-6 p-6">
      <p className="font-semibold">출제 주제</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">
        체크를 해제한 주제는 오늘의 문제와 '무엇이든'으로 받는 문제에서 빠집니다. 추가 풀이에서 주제를 직접 고르면 계속 풀 수 있습니다. 바꾼 내용은 바로 저장되고, 이미 정해진 오늘의 문제는 바뀌지 않습니다.
      </p>
      <ul className="mt-3 divide-y divide-line">{topics.map((topic) => <TopicRow key={topic.value} topic={topic} />)}</ul>
      <div className="mt-4 border-t border-line pt-5">
        <p className="mb-3 text-sm font-semibold">주제 추가</p>
        <TopicForm initial={EMPTY_INPUT} submitLabel="주제 추가" onSubmit={add} />
      </div>
    </section>
  )
}
