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
      <header className="mb-2.5 sm:mb-4">
        <h3
          id={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-sm sm:text-foreground"
        >
          {title}
        </h3>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </header>
      <div className={`grid ${colClass[columns]} gap-3.5 sm:gap-5`}>
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
    <div className={`space-y-6 sm:rounded-xl sm:border sm:border-default sm:bg-surface sm:p-6 sm:shadow-sm sm:space-y-8 ${className}`}>
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
    <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-30 -mx-4 flex flex-col-reverse flex-wrap gap-2 border-t border-border bg-background px-4 py-3 sm:-mx-6 sm:px-6 md:static md:z-auto md:mx-0 md:flex-row md:justify-end md:gap-3 md:border-default md:bg-transparent md:px-0 md:py-0 md:pt-5">
      {children}
    </div>
  )
}
