import { useState } from 'react'
import { ToastProvider } from './components/toast'
import { JobIndicator } from './components/JobProgress'
import { JobsProvider } from './state/jobs'
import { NavigationContext, type Route } from './state/navigation'
import { TodayPage } from './pages/TodayPage'
import { AttemptPage } from './pages/AttemptPage'
import { PracticePage } from './pages/PracticePage'
import { HistoryPage } from './pages/HistoryPage'
import { BankPage } from './pages/BankPage'
import { QuestionPage } from './pages/QuestionPage'
import { FeedbackPage } from './pages/FeedbackPage'
import { SettingsPage } from './pages/SettingsPage'

const MENU: { route: Route; label: string }[] = [
  { route: { name: 'today' }, label: '오늘의 문제' },
  { route: { name: 'practice' }, label: '추가 풀이' },
  { route: { name: 'history' }, label: '풀이 기록' },
  { route: { name: 'bank' }, label: '문제 은행' },
  { route: { name: 'feedback' }, label: '출제 피드백' },
  { route: { name: 'settings' }, label: '설정' },
]

const PARENT_MENU: Partial<Record<Route['name'], Route['name']>> = { attempt: 'today', question: 'bank' }

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
  const activeName = PARENT_MENU[route.name] ?? route.name
  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="px-3 pb-5 text-lg font-bold">Daily Study</p>
      {MENU.map((item) => (
        <button
          key={item.route.name}
          onClick={() => navigate(item.route)}
          className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition ${activeName === item.route.name ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'today' })
  return (
    <ToastProvider>
      <NavigationContext.Provider value={setRoute}>
        <JobsProvider>
          <div className="flex h-full">
            <Sidebar route={route} navigate={setRoute} />
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="flex h-12 shrink-0 items-center justify-end border-b border-slate-200 px-6 dark:border-slate-800">
                <JobIndicator />
              </header>
              <main className="min-h-0 flex-1 overflow-y-auto">
                <CurrentPage route={route} />
              </main>
            </div>
          </div>
        </JobsProvider>
      </NavigationContext.Provider>
    </ToastProvider>
  )
}
