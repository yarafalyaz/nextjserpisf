import type { ReactNode } from "react"
import { AppBreadcrumbs, type BreadcrumbItemData } from "@/components/ui/breadcrumbs"

export function EditPageShell({
  breadcrumbs,
  title,
  children,
}: {
  breadcrumbs: BreadcrumbItemData[]
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={breadcrumbs} />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-2xl sm:font-bold">{title}</h1>
      </div>
      {children}
    </div>
  )
}
