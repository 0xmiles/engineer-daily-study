/** Rules the main process enforces and the screens explain, kept in one place so both say the same numbers. */

export const MAX_HINTS = 3
/** Points taken off the total score for each hint. */
export const HINT_PENALTY = 5
/** A question put off after using every hint comes back in the daily set this many days later. */
export const POSTPONE_DAYS = 3

/** Follow-up questions one graded attempt can collect across rounds. */
export const MAX_FOLLOW_UPS = 4

export const TIMED_INTERVIEW_LIMITS = {
  questionCount: { min: 1, max: 5 },
  timeLimitMinutes: { min: 5, max: 60 },
} as const

export const CONVERSATION_INTERVIEW_LIMITS = {
  mainQuestionCount: { min: 1, max: 5 },
  maxFollowUps: { min: 0, max: 3 },
} as const
