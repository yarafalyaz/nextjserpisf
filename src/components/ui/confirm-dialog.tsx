"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { cn } from "@/lib/utils";

export type ConfirmVariant = "danger" | "warning" | "accent" | "success";

interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual variant for the confirm button. Default: "danger" */
  variant?: ConfirmVariant;
  /** Shows pending state on confirm button */
  isPending?: boolean;
  /** Fired when user clicks confirm */
  onConfirm: () => void;
  /** Custom classNames for the dialog content */
  className?: string;
  /** Custom children rendered inside the body (overrides body prop) */
  children?: ReactNode;
}

const variantConfig: Record<
  ConfirmVariant,
  {
    /** Tailwind classes applied to the AlertDialogAction confirm button. */
    confirmClass: string;
    /** Tailwind classes for the media icon wrapper background/foreground. */
    mediaClass: string;
    /** Icon component for the media slot (mark decorative via aria-hidden). */
    Icon: typeof AlertTriangle;
  }
> = {
  danger: {
    confirmClass:
      "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
    mediaClass: "bg-destructive/10 text-destructive",
    Icon: AlertTriangle,
  },
  warning: {
    confirmClass:
      "bg-warning text-white hover:bg-warning/90 focus-visible:ring-warning/30 dark:focus-visible:ring-warning/40",
    mediaClass: "bg-warning/15 text-warning",
    Icon: TriangleAlert,
  },
  accent: {
    confirmClass:
      "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/30",
    mediaClass: "bg-primary/10 text-primary",
    Icon: Info,
  },
  success: {
    confirmClass:
      "bg-success text-white hover:bg-success-600 focus-visible:ring-success/30",
    mediaClass: "bg-success/10 text-success",
    Icon: CheckCircle2,
  },
};

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
  // Explicit id wiring so the dialog's accessible name comes from
  // <AlertDialogTitle id={titleId}>, and its long description from
  // <AlertDialogDescription id={descriptionId}>. Radix's Content auto-binds
  // aria-labelledby/aria-describedby to these ids when they live inside the
  // same dialog, so screen readers announce both the short label and the
  // longer prompt for every variant.
  const { confirmClass, mediaClass, Icon } = variantConfig[variant];
  const hasBody = !!(children ?? body);

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className={className ?? "sm:max-w-[400px]"}>
        <AlertDialogHeader>
          <AlertDialogMedia
            className={cn(
              mediaClass,
              "sm:group-data-[size=default]/alert-dialog-content:row-span-2",
            )}
          >
            <Icon aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {hasBody && (
            <AlertDialogDescription asChild>
              <div>{children ?? body}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className={cn(confirmClass)}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
