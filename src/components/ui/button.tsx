"use client"

import Link from "next/link"
import type { ReactNode, MouseEventHandler } from "react"
import { Loader2 } from "lucide-react"
import { Button as ShadButton } from "@/components/ui/shadcn/button"
import { cn } from "@/lib/utils"

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
