"use client"

import Link from "next/link"
import { ReactNode } from "react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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

// Reusable button variants
interface ButtonProps {
  href?: string
  onClick?: () => void
  children: ReactNode
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md"
  disabled?: boolean
  type?: "button" | "submit"
  className?: string
}

const variantStyles = {
  primary: "bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md",
  secondary: "bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary",
  ghost: "text-muted-foreground hover:bg-surface-secondary hover:text-foreground",
  danger: "bg-red-500 text-white hover:bg-red-600",
}

const sizeStyles = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
}

export function Button({ href, onClick, children, variant = "secondary", size = "md", disabled, type = "button", className = "" }: ButtonProps) {
  const baseClass = `inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all ${variantStyles[variant]} ${sizeStyles[size]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`

  if (href) {
    return <Link href={href} className={baseClass}>{children}</Link>
  }

  return <button type={type} onClick={onClick} disabled={disabled} className={baseClass}>{children}</button>
}

// Back button shortcut
export function BackButton({ href, label = "← Kembali" }: { href: string; label?: string }) {
  return <Button href={href} variant="ghost">{label}</Button>
}
