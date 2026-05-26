"use client"

import { cn } from "@heroui/react"

export function DetailCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-surface rounded-xl border border-default shadow-sm p-6", className)}>{children}</div>
}

export function DetailGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4", className)}>{children}</div>
}

export function DetailItem({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted uppercase tracking-wide">{label}</span>
      <span className="text-[0.9375rem] text-foreground font-medium">{value || "-"}</span>
    </div>
  )
}
