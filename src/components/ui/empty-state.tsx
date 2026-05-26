"use client"

import { cn } from "@heroui/react"

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center text-muted", className)}>
      {children}
    </div>
  )
}
