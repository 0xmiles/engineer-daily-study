import type { Settings } from '@shared/types'

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
      <input type="checkbox" className="h-4 w-4 accent-accent" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

/** Reminder and launch-at-login fields inside the settings form; saved with the rest of the form. */
export function ReminderFields({ value, onChange }: { value: Settings; onChange: (changes: Partial<Settings>) => void }) {
  return (
    <div className="space-y-3 border-t border-line pt-5">
      <p className="label">알림과 실행</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Checkbox label="매일 알림 받기" checked={value.reminderEnabled} onChange={(reminderEnabled) => onChange({ reminderEnabled })} />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-muted">알림 시각</span>
          <input
            type="time"
            className="input w-32 py-1.5"
            value={value.reminderTime}
            disabled={!value.reminderEnabled}
            // Clearing the field gives an empty string, which the main process would reject on save.
            onChange={(event) => event.target.value && onChange({ reminderTime: event.target.value })}
          />
        </label>
      </div>
      <Checkbox label="로그인할 때 Folio를 백그라운드로 실행" checked={value.launchAtLogin} onChange={(launchAtLogin) => onChange({ launchAtLogin })} />
      <ul className="list-disc space-y-0.5 pl-5 text-xs leading-5 text-ink-muted">
        <li>알림은 Folio가 실행 중일 때만 옵니다. 오늘의 문제를 모두 풀었다면 알림을 보내지 않습니다.</li>
        <li>Windows에서는 알림을 켜 두면 창을 닫아도 알림 영역에서 계속 실행됩니다. 완전히 끝내려면 알림 영역 아이콘의 메뉴에서 종료하세요.</li>
        <li>개발 모드(npm run dev)에서는 로그인할 때 실행 설정이 적용되지 않습니다.</li>
      </ul>
    </div>
  )
}
