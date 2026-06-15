import { ReactNode } from "react"

interface FormSectionProps {
  title: string
  description?: string
  children: ReactNode
  columns?: 1 | 2 | 3
  className?: string
}

/**
 * Groups form fields into a titled section with consistent layout.
 */
export function FormSection({ title, description, children, columns = 2, className = "" }: FormSectionProps) {
  const colClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  }

  return (
    <section className={`${className}`} aria-labelledby={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <header className="mb-4">
        <h3 id={`section-${title.replace(/\s+/g, '-').toLowerCase()}`} className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </header>
      <div className={`grid ${colClass[columns]} gap-5`}>
        {children}
      </div>
    </section>
  )
}

interface FormCardProps {
  children: ReactNode
  className?: string
}

/**
 * Wrapper card for forms with consistent styling.
 */
export function FormCard({ children, className = "" }: FormCardProps) {
  return (
    <div className={`bg-surface rounded-xl border border-default shadow-sm p-6 space-y-8 ${className}`}>
      {children}
    </div>
  )
}

interface FormActionsProps {
  children: ReactNode
}

/**
 * Bottom action bar for forms (Save/Cancel buttons).
 */
export function FormActions({ children }: FormActionsProps) {
  return (
    <div className="flex justify-end gap-3 pt-5 border-t border-default">
      {children}
    </div>
  )
}
