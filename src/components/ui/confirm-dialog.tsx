"use client"

import { AlertDialog, Button } from "@heroui/react"
import type { ReactNode } from "react"

export type ConfirmVariant = "danger" | "warning" | "accent" | "success"

interface ConfirmDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Visual variant for icon & confirm button. Default: "danger" */
  variant?: ConfirmVariant
  /** Shows spinner on confirm button */
  isPending?: boolean
  /** Fired when user clicks confirm */
  onConfirm: () => void
  /** Custom classNames for the dialog */
  className?: string
  /** Custom children rendered inside AlertDialog.Body (overrides body prop) */
  children?: ReactNode
}

const variantButtonMap: Record<ConfirmVariant, "danger" | "primary"> = {
  danger: "danger",
  warning: "primary",
  accent: "primary",
  success: "primary",
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
  return (
    <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <AlertDialog.Container>
        <AlertDialog.Dialog className={className ?? "sm:max-w-[400px]"}>
          <AlertDialog.CloseTrigger />
          <AlertDialog.Header>
            <AlertDialog.Icon status={variant} />
            <AlertDialog.Heading>{title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            {children ?? (body ? <p>{body}</p> : null)}
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button slot="close" variant="tertiary">
              {cancelLabel}
            </Button>
            <Button
              variant={variantButtonMap[variant]}
              isPending={isPending}
              onPress={onConfirm}
            >
              {confirmLabel}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}
