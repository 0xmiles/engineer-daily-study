import { useState, type KeyboardEvent } from 'react'
import { Button } from './controls'

interface SubmitTextareaProps {
  placeholder: string
  submitLabel: string
  disabled?: boolean
  /** Resolves to true when the text was accepted, which clears the box. */
  onSubmit: (text: string) => Promise<boolean>
}

/** A textarea that submits with Cmd/Ctrl + Enter and keeps the text when the request fails. */
export function SubmitTextarea({ placeholder, submitLabel, disabled = false, onSubmit }: SubmitTextareaProps) {
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const canSubmit = text.trim() !== '' && !disabled && !isSubmitting
  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setIsSubmitting(true)
    const isAccepted = await onSubmit(text)
    setIsSubmitting(false)
    if (isAccepted) setText('')
  }
  const handleKey = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void submit()
    }
  }
  return (
    <div className="space-y-2">
      <textarea
        className="input h-28 text-sm leading-6"
        placeholder={placeholder}
        value={text}
        disabled={disabled || isSubmitting}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKey}
      />
      <div className="flex justify-end">
        <Button variant="secondary" isLoading={isSubmitting} disabled={!canSubmit} onClick={() => void submit()}>{submitLabel} (Cmd/Ctrl + Enter)</Button>
      </div>
    </div>
  )
}
