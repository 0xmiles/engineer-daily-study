import { useState } from 'react'
import type { Attempt, Question } from '@shared/types'
import { PageContainer } from '../components/PageHeader'
import { QuestionStatement } from '../components/QuestionStatement'
import { EditorFooter, LengthMeter, SubmitConfirmDialog, useAutosave, useEditorShortcuts, useSubmitAttempt } from './SolveView'

/** One column with a small input: a short answer needs no markdown preview, and hints would give the answer away. */
export function ShortAnswerSolveView({ attempt, question }: { attempt: Attempt; question: Question }) {
  const [answer, setAnswer] = useState(attempt.answer)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const { saveState, saveNow, scheduleSave, cancelPending } = useAutosave(attempt.id, attempt.draftSavedAt)
  const { isSubmitting, submit } = useSubmitAttempt(attempt.id, cancelPending)
  const hasAnswer = answer.trim() !== ''
  useEditorShortcuts({ onSave: () => void saveNow(answer), onRequestSubmit: () => setIsConfirmOpen(true), canSubmit: hasAnswer && !isSubmitting })

  const changeAnswer = (nextAnswer: string): void => {
    setAnswer(nextAnswer)
    scheduleSave(nextAnswer)
  }
  const confirmSubmit = (): void => {
    setIsConfirmOpen(false)
    void submit(answer)
  }

  return (
    <PageContainer>
      <QuestionStatement question={question} />
      <div className="mt-6 flex justify-end"><LengthMeter answer={answer} question={question} /></div>
      <textarea
        className="input mt-2 h-32 w-full resize-none px-5 py-4 text-[15px] leading-7"
        placeholder="핵심만 짧게 답하세요."
        value={answer}
        onChange={(event) => changeAnswer(event.target.value)}
        disabled={isSubmitting}
        autoFocus
      />
      <EditorFooter saveState={saveState} isSubmitting={isSubmitting} hasAnswer={hasAnswer} onRequestSubmit={() => setIsConfirmOpen(true)} />
      <SubmitConfirmDialog isOpen={isConfirmOpen} onConfirm={confirmSubmit} onCancel={() => setIsConfirmOpen(false)} />
    </PageContainer>
  )
}
