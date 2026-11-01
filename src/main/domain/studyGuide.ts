import type { StudyGuide } from '@shared/types'
import { normalizeKeyword } from './studyNotes'

export type StudyGuideContent = Omit<StudyGuide, 'generatedAt' | 'runner'>

function cleanList(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))]
}

/** Drops blank entries, and related keywords that only respell the note's own keyword. */
export function normalizeStudyGuide(content: StudyGuideContent, keyword: string): StudyGuideContent {
  const summary = content.summary.trim()
  const sections = content.sections.map(({ heading, body }) => ({ heading: heading.trim(), body: body.trim() })).filter((section) => section.heading && section.body)
  if (!summary || sections.length === 0) throw new Error('학습 노트 내용이 비어 있습니다. 다시 만들어 주세요.')
  const ownKeyword = normalizeKeyword(keyword)
  return {
    summary,
    sections,
    pitfalls: cleanList(content.pitfalls),
    selfCheck: content.selfCheck.map(({ question, answer }) => ({ question: question.trim(), answer: answer.trim() })).filter((item) => item.question && item.answer),
    relatedKeywords: cleanList(content.relatedKeywords).filter((related) => normalizeKeyword(related) !== ownKeyword),
  }
}
