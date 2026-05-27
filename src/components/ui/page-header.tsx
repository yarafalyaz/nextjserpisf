"use client"

import Link from "next/link"
import { ReactNode } from "react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button as HeroButton } from "@heroui/react"

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  breadcrumbs?: BreadcrumbItem[]
  actions?: ReactNode
  badge?: ReactNode
}

export function PageHeader({ title, subtitle, breadcrumbs, actions, badge }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <AppBreadcrumbs items={breadcrumbs} />
      )}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {badge}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap">
            {actions}
          </div>
        )}
      </div>
      {subtitle && (
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  )
}

// Reusable button variants (HeroUI v3)
interface ButtonProps {
  href?: string
  onClick?: () => void
  onPress?: () => void
  children: ReactNode
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md" | "lg"
  disabled?: boolean
  type?: "button" | "submit"
  className?: string
  id?: string
  [key: string]: any
}

const variantMap: Record<string, "primary" | "secondary" | "danger" | "ghost" | "outline"> = {
  primary: "primary",
  secondary: "outline",
  ghost: "ghost",
  danger: "danger",
}

export function Button({ href, onClick, onPress, children, variant = "secondary", size = "md", disabled, type = "button", className = "", id, ...rest }: ButtonProps) {
  const heroVariant: "primary" | "secondary" | "danger" | "ghost" | "outline" = variantMap[variant] || "outline"
  const handlePress = onPress || onClick

  if (href) {
    return (
      <Link href={href} tabIndex={-1}>
        <HeroButton variant={heroVariant} size={size} isDisabled={disabled} className={className} {...rest}>
          {children}
        </HeroButton>
      </Link>
    )
  }

  return (
    <HeroButton
      type={type}
      onPress={handlePress}
      variant={heroVariant}
      size={size}
      isDisabled={disabled}
      className={className}
      id={id}
      {...rest}
    >
      {children}
    </HeroButton>
  )
}

// Back button shortcut
export function BackButton({ href, label = "← Kembali" }: { href: string; label?: string }) {
  return <Button href={href} variant="ghost">{label}</Button>
}
