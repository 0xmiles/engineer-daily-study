export const api = window.dailyStudy

const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']+': (Error: )?/

/** Electron prefixes errors thrown in the main process; the user only needs the original message. */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(IPC_ERROR_PREFIX, '')
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
}

export function countCharacters(text: string): number {
  return text.replace(/\s/g, '').length
}
