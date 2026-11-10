import Link from 'next/link'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/shadcn/breadcrumb"

export interface BreadcrumbItemData {
  label: string
  href?: string
}

export function AppBreadcrumbs({ items, ariaLabel = "Navigasi breadcrumb" }: { items: BreadcrumbItemData[]; ariaLabel?: string }) {
  return (
    <Breadcrumb aria-label={ariaLabel} className="mb-1">
      <BreadcrumbList className="text-xs">
        {items.flatMap((item, index) => {
          const isLast = index === items.length - 1
          const itemKey = item.href ? `${item.href}-${item.label}` : `crumb-${item.label}-${index}`
          const crumb = (
            <BreadcrumbItem key={itemKey}>
              {isLast || !item.href ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={item.href}>{item.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          )
          if (isLast) return [crumb]
          return [crumb, <BreadcrumbSeparator key={`sep-${index}`} />]
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
