"use client"

import type { ReactNode } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog"
import { cn } from "@/lib/utils"

export type ConfirmVariant = "danger" | "warning" | "accent" | "success"

interface ConfirmDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Visual variant for the confirm button. Default: "danger" */
  variant?: ConfirmVariant
  /** Shows pending state on confirm button */
  isPending?: boolean
  /** Fired when user clicks confirm */
  onConfirm: () => void
  /** Custom classNames for the dialog content */
  className?: string
  /** Custom children rendered inside the body (overrides body prop) */
  children?: ReactNode
}

export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  body,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  variant = "danger",
  isPending = false,
  onConfirm,
  className,
  children,
}: ConfirmDialogProps) {
  const danger = variant === "danger"

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className={className ?? "sm:max-w-[400px]"}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {(children || body) && (
            <AlertDialogDescription asChild>
              <div>{children ?? body}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            className={cn(
              danger &&
                "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20"
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
