import type { Difficulty, QuestionCategory, QuestionFormat, Topic } from '@shared/types'
import { DIFFICULTIES, FORMATS, categoriesOf } from '@shared/taxonomy'
import { useTopicOptions } from '../state/topics'
import { Select } from './controls'

export interface SpecDraft {
  format: QuestionFormat
  category: QuestionCategory | ''
  topic: Topic | ''
  difficulty: Difficulty
}

/** Format, category, topic and difficulty pickers; category resets when the format changes. */
export function SpecFields({ value, onChange, allowAny = true }: { value: SpecDraft; onChange: (value: SpecDraft) => void; allowAny?: boolean }) {
  const anyLabel = allowAny ? '무엇이든' : undefined
  const topicOptions = useTopicOptions()
  return (
    <div className="grid grid-cols-4 gap-3">
      <Select label="형식" value={value.format} options={FORMATS} onChange={(format) => onChange({ ...value, format: format as QuestionFormat, category: '' })} />
      <Select label="유형" value={value.category} options={categoriesOf(value.format)} allowEmpty={anyLabel} onChange={(category) => onChange({ ...value, category })} />
      <Select label="주제" value={value.topic} options={topicOptions} allowEmpty={anyLabel} onChange={(topic) => onChange({ ...value, topic })} />
      <Select label="난이도" value={value.difficulty} options={DIFFICULTIES} onChange={(difficulty) => onChange({ ...value, difficulty: difficulty as Difficulty })} />
    </div>
  )
}

export function specFromDraft(draft: SpecDraft) {
  return {
    format: draft.format,
    difficulty: draft.difficulty,
    ...(draft.category ? { category: draft.category } : {}),
    ...(draft.topic ? { topic: draft.topic } : {}),
  }
}
