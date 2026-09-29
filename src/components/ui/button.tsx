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
  | "success"

type ShadVariant = React.ComponentProps<typeof ShadButton>["variant"]

const variantMap: Record<ButtonVariant, ShadVariant> = {
  primary: "default",
  secondary: "secondary",
  tertiary: "ghost",
  outline: "outline",
  ghost: "ghost",
  danger: "destructive",
  "danger-soft": "outline",
  success: "default",
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
  role?: string
  "aria-expanded"?: boolean
  "aria-required"?: boolean | "true" | "false"
  slot?: string
  formAction?: string | ((formData: FormData) => void | Promise<void>)
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

  const variantClass = variant === "success"
    ? "bg-success text-white hover:bg-success/90 focus-visible:ring-success/20 dark:bg-success/60 dark:focus-visible:ring-success/40"
    : ""

  if (href) {
    return (
      <ShadButton
        asChild
        variant={shadVariant}
        size={shadSize}
        className={cn(variantClass, className)}
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
      className={cn(variantClass, className)}
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
