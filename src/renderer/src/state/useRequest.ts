import { useCallback, useState } from 'react'
import { errorMessage } from '../lib/api'
import { useToast } from '../components/toast'

export interface RequestTracker {
  isRunning: boolean
  /** Resolves to undefined when the request failed; the failure has already been shown as a toast. */
  run: <T>(action: () => Promise<T>, failureTitle: string) => Promise<T | undefined>
}

/** Tracks one user-triggered request so its button can stay disabled until the main process answers. */
export function useRequest(): RequestTracker {
  const [isRunning, setIsRunning] = useState(false)
  const showToast = useToast()
  const run = useCallback(async <T,>(action: () => Promise<T>, failureTitle: string): Promise<T | undefined> => {
    setIsRunning(true)
    try {
      return await action()
    } catch (reason) {
      showToast({ tone: 'error', title: failureTitle, message: errorMessage(reason) })
      return undefined
    } finally {
      setIsRunning(false)
    }
  }, [showToast])
  return { isRunning, run }
}
