import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ToastTone = 'success' | 'error' | 'info'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  message?: string
  action?: ToastAction
}

type ShowToast = (toast: Omit<ToastItem, 'id'>) => void

const AUTO_DISMISS_MILLISECONDS = { success: 3500, info: 3500, error: 8000 } satisfies Record<ToastTone, number>
const TONE_CLASSES: Record<ToastTone, string> = {
  success: 'border-l-good',
  error: 'border-l-bad',
  info: 'border-l-line-strong',
}
const TONE_ICONS: Record<ToastTone, string> = { success: '✓', error: '!', info: 'i' }

const ToastContext = createContext<ShowToast>(() => undefined)

export function useToast(): ShowToast {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), [])
  const show = useCallback<ShowToast>((toast) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current.slice(-3), { ...toast, id }])
    setTimeout(() => dismiss(id), AUTO_DISMISS_MILLISECONDS[toast.tone])
  }, [dismiss])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} role="status" className={`card pointer-events-auto flex gap-3 border-l-4 p-4 shadow-lg ${TONE_CLASSES[toast.tone]}`}>
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-bold">{TONE_ICONS[toast.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.message && <p className="mt-0.5 break-words text-xs text-ink-muted">{toast.message}</p>}
              {toast.action && (
                <button className="mt-2 text-xs font-semibold text-accent-ink hover:underline" onClick={() => { toast.action!.onClick(); dismiss(toast.id) }}>
                  {toast.action.label}
                </button>
              )}
            </div>
            <button className="text-ink-faint hover:text-ink" onClick={() => dismiss(toast.id)} aria-label="닫기">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
