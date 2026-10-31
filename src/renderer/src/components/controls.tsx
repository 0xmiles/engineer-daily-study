import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Spinner } from './feedback'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-400',
  secondary: 'border border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
  ghost: 'hover:bg-slate-100 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-400',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  isLoading?: boolean
}

/** Disabled while loading so a slow action cannot be triggered twice. */
export function Button({ variant = 'primary', isLoading = false, disabled, children, className = '', ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-70 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {isLoading && <Spinner size={14} />}
      {children}
    </button>
  )
}

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ isOpen, title, description, confirmLabel, tone = 'primary', onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onCancel])

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6" onClick={onCancel}>
      <div className="card w-full max-w-md p-6" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>취소</Button>
          <Button variant={tone} onClick={onConfirm} autoFocus>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { value: T; label: string }[]; active: T; onChange: (value: T) => void }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={tab.value === active}
          onClick={() => onChange(tab.value)}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab.value === active ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function Select<T extends string>({ label, value, options, onChange, allowEmpty }: {
  label: string
  value: T | ''
  options: { value: T; label: string }[]
  onChange: (value: T | '') => void
  allowEmpty?: string
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value as T | '')}>
        {allowEmpty && <option value="">{allowEmpty}</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}
