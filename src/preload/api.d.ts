import type { DailyStudyApi } from '../shared/api'

declare global {
  interface Window {
    dailyStudy: DailyStudyApi
  }
}

export {}
