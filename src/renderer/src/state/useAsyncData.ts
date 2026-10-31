import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from '../lib/api'

export interface AsyncData<T> {
  data: T | null
  error: string | null
  isLoading: boolean
  reload: () => void
}

/**
 * Loads data once with a loading state, then refreshes silently whenever the main process reports a data change,
 * so screens never flash back to a skeleton while the user is reading.
 */
export function useAsyncData<T>(load: () => Promise<T>, dependencies: unknown[]): AsyncData<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const loadRef = useRef(load)
  loadRef.current = load

  const fetchData = useCallback((showLoading: boolean) => {
    if (showLoading) setIsLoading(true)
    loadRef.current()
      .then((value) => {
        setData(value)
        setError(null)
      })
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    setData(null)
    fetchData(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  useEffect(() => api.onDataChanged(() => fetchData(false)), [fetchData])

  return { data, error, isLoading, reload: () => fetchData(true) }
}
