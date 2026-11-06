import type { StudyNote } from '@shared/api'
import { useNavigate } from '../state/navigation'
import { useTopics } from '../state/topics'
import { Badge } from './QuestionBadges'
import { DoneToggle, NeededByLine, SourceLink } from './StudyNoteParts'

/** A summary of one note; the whole card opens the note page, where the study material and memo live. */
export function StudyNoteCard({ note }: { note: StudyNote }) {
  const { label: topicLabel } = useTopics()
  const navigate = useNavigate()
  const latestSource = note.sources.at(0)
  const open = (): void => navigate({ name: 'studyNote', keyword: note.keyword })

  return (
    <li className={`card group cursor-pointer p-5 transition-colors hover:border-accent/40 ${note.isDone ? 'opacity-70' : ''}`} onClick={open}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            {latestSource && <Badge className="bg-accent-soft text-accent-ink">추천 {note.sources.length}회</Badge>}
            {note.questions.length > 0 && <Badge>문제 {note.questions.length}개</Badge>}
            {note.isReopened && <Badge className="bg-warn-soft text-warn">다시 추천됨</Badge>}
            {note.hasGuide && <Badge className="bg-good-soft text-good">노트 있음</Badge>}
            {note.topics.map((topic) => <Badge key={topic}>{topicLabel(topic)}</Badge>)}
          </div>
          <button className={`mt-2 text-left text-lg font-bold leading-snug tracking-tight group-hover:text-accent-ink ${note.isDone ? 'line-through decoration-ink-faint' : ''}`} onClick={(event) => { event.stopPropagation(); open() }}>
            {note.keyword}
          </button>
          {latestSource && (
            <>
              <p className="mt-1 text-sm leading-6">{latestSource.reason}</p>
              <SourceLink source={latestSource} />
            </>
          )}
          {!latestSource && <NeededByLine questions={note.questions} />}
          {note.memo.trim() && <p className="mt-3 line-clamp-2 border-l-2 border-line pl-3 text-sm text-ink-muted">{note.memo}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-6">
          <DoneToggle note={note} />
          <span className="text-sm font-medium text-accent-ink opacity-0 transition-opacity group-hover:opacity-100">공부하기 →</span>
        </div>
      </div>
    </li>
  )
}
