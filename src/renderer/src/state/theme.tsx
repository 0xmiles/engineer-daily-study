import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ThemePreference } from '@shared/types'
import { api } from '../lib/api'
import { useRequest } from './useRequest'

interface ThemeState {
  /** Null until the saved choice has loaded. */
  theme: ThemePreference | null
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeState>({ theme: null, setTheme: () => undefined })

export function useTheme(): ThemeState {
  return useContext(ThemeContext)
}

/**
 * The main process applies the saved theme before the window opens and restyles the page when it changes,
 * so the renderer only tracks which choice to highlight. A failed save puts the highlight back.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference | null>(null)
  const saveRequest = useRequest()
  useEffect(() => {
    void api.getSettings().then((settings) => setThemeState(settings.theme))
  }, [])

  const setTheme = (nextTheme: ThemePreference): void => {
    const previousTheme = theme
    setThemeState(nextTheme)
    void saveRequest.run(() => api.saveSettings({ theme: nextTheme }), '화면 테마를 바꾸지 못했습니다').then((saved) => {
      if (!saved) setThemeState(previousTheme)
    })
  }
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
