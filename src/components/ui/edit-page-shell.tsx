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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
      </div>
      {children}
    </div>
  )
}
