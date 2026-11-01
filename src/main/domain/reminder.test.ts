import { describe, expect, it } from 'vitest'
import { isReminderTimePassed, millisecondsUntilReminder, reminderBody } from './reminder'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe('millisecondsUntilReminder', () => {
  it('waits until later today when the time is still ahead', () => {
    expect(millisecondsUntilReminder('09:00', new Date(2026, 10, 1, 8, 30))).toBe(30 * MINUTE)
  })

  it('waits until tomorrow once today\'s time has passed, including the exact minute', () => {
    expect(millisecondsUntilReminder('09:00', new Date(2026, 10, 1, 9, 0))).toBe(24 * HOUR)
    expect(millisecondsUntilReminder('09:00', new Date(2026, 10, 1, 21, 0))).toBe(12 * HOUR)
  })

  it('crosses month ends', () => {
    expect(millisecondsUntilReminder('00:30', new Date(2026, 9, 31, 23, 45))).toBe(45 * MINUTE)
  })
})

describe('isReminderTimePassed', () => {
  it('compares against today\'s reminder time', () => {
    expect(isReminderTimePassed('09:00', new Date(2026, 10, 1, 8, 59))).toBe(false)
    expect(isReminderTimePassed('09:00', new Date(2026, 10, 1, 9, 0))).toBe(true)
  })
})

describe('reminderBody', () => {
  it('stays silent when every daily question is done', () => {
    expect(reminderBody(0, { current: 3, studiedToday: false })).toBeNull()
  })

  it('mentions an alive streak only while today is not studied yet', () => {
    expect(reminderBody(2, { current: 5, studiedToday: false })).toBe('아직 풀지 않은 오늘의 문제가 2개 있습니다. 연속 5일째 공부하고 있습니다. 오늘 문제를 풀면 6일이 됩니다.')
    expect(reminderBody(1, { current: 5, studiedToday: true })).toBe('아직 풀지 않은 오늘의 문제가 1개 있습니다.')
    expect(reminderBody(2, { current: 0, studiedToday: false })).toBe('아직 풀지 않은 오늘의 문제가 2개 있습니다.')
  })
})
