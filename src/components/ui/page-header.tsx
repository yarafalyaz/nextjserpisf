"use client"

import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"
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

type HeroButtonProps = ComponentProps<typeof HeroButton>
type ButtonVariant = NonNullable<HeroButtonProps["variant"]>

// Reusable button wrapper that exposes HeroUI v3 props across the app.
interface ButtonProps extends Omit<HeroButtonProps, "children" | "type" | "variant"> {
  href?: string
  children: ReactNode
  title?: string
  variant?: ButtonVariant
  size?: "sm" | "md" | "lg"
  type?: "button" | "submit" | "reset"
}

const variantMap: Record<ButtonVariant, ButtonVariant> = {
  primary: "primary",
  secondary: "secondary",
  tertiary: "tertiary",
  outline: "outline",
  ghost: "ghost",
  danger: "danger",
  "danger-soft": "danger-soft",
}

export function Button({ href, children, variant = "secondary", size = "md", type = "button", className = "", id, ...rest }: ButtonProps) {
  const heroVariant = variantMap[variant] || "secondary"

  if (href) {
    return (
      <HeroButton
        variant={heroVariant}
        size={size}
        className={className}
        id={id}
        render={(props) => (
          <Link {...(props as unknown as Omit<ComponentProps<typeof Link>, "href">)} href={href} />
        )}
        {...rest}
      >
        {children}
      </HeroButton>
    )
  }

  return (
    <HeroButton
      type={type}
      variant={heroVariant}
      size={size}
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
