"use client"

import Link from "next/link"
import type { ReactNode, MouseEventHandler } from "react"
import { Loader2 } from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button as ShadButton } from "@/components/ui/shadcn/button"
import { cn } from "@/lib/utils"

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

// HeroUI-era variant names kept for backwards compatibility across the app.
type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "outline"
  | "ghost"
  | "danger"
  | "danger-soft"

type ShadVariant = React.ComponentProps<typeof ShadButton>["variant"]

const variantMap: Record<ButtonVariant, ShadVariant> = {
  primary: "default",
  secondary: "secondary",
  tertiary: "ghost",
  outline: "outline",
  ghost: "ghost",
  danger: "destructive",
  "danger-soft": "outline",
}

const sizeMap: Record<"sm" | "md" | "lg", React.ComponentProps<typeof ShadButton>["size"]> = {
  sm: "sm",
  md: "default",
  lg: "lg",
}

interface ButtonProps {
  href?: string
  children: ReactNode
  title?: string
  variant?: ButtonVariant
  size?: "sm" | "md" | "lg"
  type?: "button" | "submit" | "reset"
  className?: string
  id?: string
  /** HeroUI-compatible handlers/flags */
  onPress?: () => void
  onClick?: MouseEventHandler<HTMLButtonElement>
  isDisabled?: boolean
  isPending?: boolean
  isIconOnly?: boolean
  "aria-label"?: string
  slot?: string
}

export function Button({
  href,
  children,
  variant = "secondary",
  size = "md",
  type = "button",
  className,
  id,
  onPress,
  onClick,
  isDisabled,
  isPending,
  isIconOnly,
  ...rest
}: ButtonProps) {
  const shadVariant = variantMap[variant] ?? "secondary"
  const shadSize = isIconOnly ? "icon" : (sizeMap[size] ?? "default")

  if (href) {
    return (
      <ShadButton
        asChild
        variant={shadVariant}
        size={shadSize}
        className={className}
        id={id}
        {...rest}
      >
        <Link href={href}>{children}</Link>
      </ShadButton>
    )
  }

  return (
    <ShadButton
      type={type}
      variant={shadVariant}
      size={shadSize}
      className={cn(className)}
      id={id}
      disabled={isDisabled || isPending}
      onClick={(e) => {
        onClick?.(e)
        onPress?.()
      }}
      {...rest}
    >
      {isPending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </ShadButton>
  )
}

// Back button shortcut
export function BackButton({ href, label = "← Kembali" }: { href: string; label?: string }) {
  return <Button href={href} variant="ghost">{label}</Button>
}
