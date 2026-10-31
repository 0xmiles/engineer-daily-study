import ReactMarkdown, { type Components, type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

/** Links must never replace the app window; the main process hands new-window requests to the external browser. */
const MARKDOWN_COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
}

// Korean text writes ranges as "1~2초", so a single tilde must not open strikethrough; `~~text~~` still does.
const REMARK_PLUGINS: Options['remarkPlugins'] = [[remarkGfm, { singleTilde: false }]]

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`markdown ${className}`}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={[rehypeHighlight]} components={MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>
    </div>
  )
}
