import type { ThemePreference } from '@shared/types'
import { useTheme } from '../state/theme'

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
  { value: 'system', label: '시스템' },
]

/** Applies the theme as soon as it is picked; there is no separate save step. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  return (
    <div role="radiogroup" aria-label="화면 테마" className={`flex gap-0.5 rounded-xl bg-line/50 p-1 ${className}`}>
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={theme === option.value}
          onClick={() => setTheme(option.value)}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${theme === option.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
