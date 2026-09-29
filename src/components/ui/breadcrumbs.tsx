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
    <Breadcrumb aria-label={ariaLabel} className="mb-4">
      <BreadcrumbList>
        {items.flatMap((item, index) => {
          const isLast = index === items.length - 1
          const crumb = (
            <BreadcrumbItem key={index}>
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
