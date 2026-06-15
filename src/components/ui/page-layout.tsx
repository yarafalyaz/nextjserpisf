import { cn } from "@/lib/utils"

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-6", className)}>{children}</div>
}

export function PageHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-between flex-wrap gap-4", className)}>{children}</div>
}

export function PageTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h1 className={cn("text-2xl font-bold text-foreground m-0", className)}>{children}</h1>
}

export function PageSubtitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[0.9375rem] text-muted-foreground mt-1", className)}>{children}</p>
}
