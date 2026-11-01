import { useEffect, useState } from 'react'
import { ToastProvider } from './components/toast'
import { FolioMark } from './components/FolioMark'
import { JobIndicator } from './components/JobProgress'
import { ThemeToggle } from './components/ThemeToggle'
import { JobsProvider } from './state/jobs'
import { NavigationContext, type Route } from './state/navigation'
import { ThemeProvider } from './state/theme'
import { TodayPage } from './pages/TodayPage'
import { AttemptPage } from './pages/AttemptPage'
import { PracticePage } from './pages/PracticePage'
import { HistoryPage } from './pages/HistoryPage'
import { BankPage } from './pages/BankPage'
import { QuestionPage } from './pages/QuestionPage'
import { FeedbackPage } from './pages/FeedbackPage'
import { SettingsPage } from './pages/SettingsPage'

const APP_NAME = 'Folio'

const MENU: { route: Route; label: string }[] = [
  { route: { name: 'today' }, label: '오늘의 문제' },
  { route: { name: 'practice' }, label: '추가 풀이' },
  { route: { name: 'history' }, label: '풀이 기록' },
  { route: { name: 'bank' }, label: '문제 은행' },
  { route: { name: 'feedback' }, label: '출제 피드백' },
  { route: { name: 'settings' }, label: '설정' },
]

const PARENT_MENU: Partial<Record<Route['name'], Route['name']>> = { attempt: 'today', question: 'bank' }

function activeMenuName(route: Route): Route['name'] {
  return PARENT_MENU[route.name] ?? route.name
}

/** The window title names the open menu, e.g. "Folio — 오늘의 문제". */
function useWindowTitle(route: Route): void {
  const label = MENU.find((item) => item.route.name === activeMenuName(route))?.label
  useEffect(() => {
    document.title = label ? `${APP_NAME} — ${label}` : APP_NAME
  }, [label])
}

function CurrentPage({ route }: { route: Route }) {
  switch (route.name) {
    case 'today': return <TodayPage />
    case 'attempt': return <AttemptPage key={route.attemptId} attemptId={route.attemptId} />
    case 'practice': return <PracticePage />
    case 'history': return <HistoryPage />
    case 'bank': return <BankPage />
    case 'question': return <QuestionPage key={route.questionId} questionId={route.questionId} />
    case 'feedback': return <FeedbackPage />
    case 'settings': return <SettingsPage />
  }
}

function Sidebar({ route, navigate }: { route: Route; navigate: (route: Route) => void }) {
  const activeName = activeMenuName(route)
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5 border-r border-line bg-sidebar px-3 py-5">
      <div className="flex items-center gap-2.5 px-3 pb-6">
        <FolioMark size={24} />
        <span className="text-[17px] font-bold tracking-tight">{APP_NAME}</span>
      </div>
      {MENU.map((item) => (
        <button
          key={item.route.name}
          onClick={() => navigate(item.route)}
          className={`rounded-lg px-3 py-2 text-left text-sm transition ${activeName === item.route.name ? 'bg-line/60 font-semibold text-ink' : 'font-medium text-ink-muted hover:bg-line/40 hover:text-ink'}`}
        >
          {item.label}
        </button>
      ))}
      <ThemeToggle className="mt-auto" />
    </nav>
  )
}

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'today' })
  useWindowTitle(route)
  return (
    <ToastProvider>
      <ThemeProvider>
        <NavigationContext.Provider value={setRoute}>
          <JobsProvider>
            <div className="flex h-full">
              <Sidebar route={route} navigate={setRoute} />
              <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-12 shrink-0 items-center justify-end px-6">
                  <JobIndicator />
                </header>
                <main className="min-h-0 flex-1 overflow-y-auto">
                  <CurrentPage route={route} />
                </main>
              </div>
            </div>
          </JobsProvider>
        </NavigationContext.Provider>
      </ThemeProvider>
    </ToastProvider>
  )
}
