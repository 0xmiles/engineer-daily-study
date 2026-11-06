import { useState, type FormEvent } from 'react'
import type { StudyNote } from '@shared/api'
import type { Topic } from '@shared/types'
import { api } from '../lib/api'
import { toggleValue } from '../lib/studyNoteFilters'
import { useRequest } from '../state/useRequest'
import { useTopicOptions } from '../state/topics'
import { Button, ToggleChip } from './controls'

const MAX_KEYWORD_LENGTH = 100

/** Adds a keyword the user wants to study; the note page starts writing its material when it opens. */
export function AddStudyNoteForm({ onAdded, onCancel }: { onAdded: (note: StudyNote) => void; onCancel: () => void }) {
  const [keyword, setKeyword] = useState('')
  const [topics, setTopics] = useState<Topic[]>([])
  const topicOptions = useTopicOptions()
  const request = useRequest()

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const note = await request.run(() => api.addStudyNote({ keyword, topics }), '노트를 추가하지 못했습니다')
    if (note) onAdded(note)
  }

  return (
    <form className="card mb-5 space-y-4 p-5" onSubmit={(event) => void submit(event)}>
      <label className="block">
        <span className="label">공부할 키워드</span>
        <input className="input" autoFocus value={keyword} maxLength={MAX_KEYWORD_LENGTH} placeholder="예: Outbox CDC (Debezium)" onChange={(event) => setKeyword(event.target.value)} />
      </label>
      <div>
        <span className="label">주제 (고르지 않아도 되고, 여러 개 고를 수 있습니다)</span>
        <div className="flex flex-wrap gap-1.5">
          {topicOptions.map((option) => (
            <ToggleChip key={option.value} label={option.label} isActive={topics.includes(option.value)} onClick={() => setTopics((selected) => toggleValue(selected, option.value))} />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">추가하면 노트가 열리고, 튜터가 내용을 정리하기 시작합니다.</p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>취소</Button>
          <Button type="submit" disabled={!keyword.trim()} isLoading={request.isRunning}>추가</Button>
        </div>
      </div>
    </form>
  )
}
