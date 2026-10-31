import type { Question } from '@shared/types'
import { Markdown } from './Markdown'
import { QuestionBadges } from './QuestionBadges'

/** The part of a question the solver may see before submitting: no rubric, no model answer. */
export function QuestionStatement({ question, showSource = false }: { question: Question; showSource?: boolean }) {
  return (
    <article>
      <QuestionBadges question={question} showSource={showSource} />
      <h1 className="mt-3 text-xl font-bold leading-snug">{question.title}</h1>
      <section className="mt-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">상황</h2>
        <Markdown text={question.situation} />
      </section>
      <section className="mt-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">요구 사항</h2>
        <ol className="space-y-2">
          {question.requirements.map((requirement, index) => (
            <li key={index} className="flex gap-3 text-[15px] leading-7">
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{index + 1}</span>
              <span>{requirement}</span>
            </li>
          ))}
        </ol>
      </section>
      <p className="mt-6 text-xs text-slate-500">권장 분량: 공백 제외 {question.recommendedLength.min}~{question.recommendedLength.max}자</p>
    </article>
  )
}
