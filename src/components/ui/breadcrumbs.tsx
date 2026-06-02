'use client'

import { Breadcrumbs } from '@heroui/react'


export interface BreadcrumbItem {
  label: string
  href?: string
}

export function AppBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <Breadcrumbs className="mb-4">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        if (isLast || !item.href) {
          return (
            <Breadcrumbs.Item key={index}>
              {item.label}
            </Breadcrumbs.Item>
          )
        }
        return (
          <Breadcrumbs.Item key={index} href={item.href}>
            {item.label}
          </Breadcrumbs.Item>
        )
      })}
    </Breadcrumbs>
  )
}
