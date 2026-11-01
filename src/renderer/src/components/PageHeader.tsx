import type { ReactNode } from 'react'

export function PageContainer({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto px-10 pb-12 pt-4 ${wide ? 'max-w-7xl' : 'max-w-4xl'}`}>{children}</div>
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}
