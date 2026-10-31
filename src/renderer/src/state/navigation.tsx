import { createContext, useContext } from 'react'

export type Route =
  | { name: 'today' }
  | { name: 'attempt'; attemptId: string }
  | { name: 'practice' }
  | { name: 'history' }
  | { name: 'bank' }
  | { name: 'question'; questionId: string }
  | { name: 'feedback' }
  | { name: 'settings' }

export type Navigate = (route: Route) => void

export const NavigationContext = createContext<Navigate>(() => undefined)

export function useNavigate(): Navigate {
  return useContext(NavigationContext)
}
