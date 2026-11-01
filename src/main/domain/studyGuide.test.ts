import { describe, expect, it } from 'vitest'
import { normalizeStudyGuide, type StudyGuideContent } from './studyGuide'

const content: StudyGuideContent = {
  summary: ' 요약입니다. ',
  sections: [{ heading: ' 개념 ', body: ' 본문 ' }, { heading: '빈 섹션', body: '  ' }],
  pitfalls: ['오해', ' 오해 ', ''],
  selfCheck: [{ question: '질문', answer: '답' }, { question: '답 없는 질문', answer: '' }],
  relatedKeywords: ['kafka-리밸런싱', 'Static Membership', ' '],
}

describe('normalizeStudyGuide', () => {
  it('trims text and drops blank, duplicate and self-referencing entries', () => {
    expect(normalizeStudyGuide(content, 'Kafka 리밸런싱')).toEqual({
      summary: '요약입니다.',
      sections: [{ heading: '개념', body: '본문' }],
      pitfalls: ['오해'],
      selfCheck: [{ question: '질문', answer: '답' }],
      relatedKeywords: ['Static Membership'],
    })
  })

  it('rejects a guide without a summary or any section', () => {
    expect(() => normalizeStudyGuide({ ...content, sections: [] }, 'Kafka')).toThrow('비어 있습니다')
    expect(() => normalizeStudyGuide({ ...content, summary: ' ' }, 'Kafka')).toThrow('비어 있습니다')
  })
})
