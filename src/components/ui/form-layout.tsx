"use client"

import { cn } from "@heroui/react"

export function FormCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-surface rounded-xl border border-default shadow-sm p-6", className)}>{children}</div>
}

export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-5", className)}>{children}</div>
}

export function FormGroup({ children, className, full }: { children: React.ReactNode; className?: string; full?: boolean }) {
  return <div className={cn("flex flex-col gap-1.5", full && "col-span-full", className)}>{children}</div>
}
