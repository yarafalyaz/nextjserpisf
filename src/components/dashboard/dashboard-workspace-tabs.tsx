"use client"

import { useState, type ReactNode } from "react"
import { BarChart3, Receipt, Wrench } from "@/components/ui/fontawesome-icons"
import { cn } from "@/lib/utils"

type MobileDashboardTab = "operasional" | "transaksi" | "analitik"

interface DashboardWorkspaceTabsProps {
  operasionalCount?: number
  transaksiCount?: number
  analitikSection: ReactNode
  operasionalSection: ReactNode
  transaksiSection: ReactNode
}

export function DashboardWorkspaceTabs({
  operasionalCount = 0,
  transaksiCount = 0,
  analitikSection,
  operasionalSection,
  transaksiSection,
}: DashboardWorkspaceTabsProps) {
  const [activeTab, setActiveTab] = useState<MobileDashboardTab>("operasional")

  const tabs: Array<{
    id: MobileDashboardTab
    label: string
    icon: typeof Wrench
    count?: number
  }> = [
    {
      id: "operasional",
      label: "Operasional",
      icon: Wrench,
      count: operasionalCount > 0 ? operasionalCount : undefined,
    },
    {
      id: "transaksi",
      label: "Transaksi",
      icon: Receipt,
      count: transaksiCount > 0 ? transaksiCount : undefined,
    },
    {
      id: "analitik",
      label: "Analitik",
      icon: BarChart3,
    },
  ]

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {/* Mobile segmented workspace switcher */}
      <div className="px-4 md:hidden">
        <div
          role="tablist"
          aria-label="Bagian dasbor"
          className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/70 p-1"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex min-h-10 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors duration-150",
                  isActive
                    ? "bg-card text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={cn(
                      "inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground",
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Desktop order: Analitik -> Operasional -> Transaksi.
          Mobile order: only active tab panel is shown. */}
      <div
        className={cn(
          "flex flex-col gap-4 md:gap-5",
          activeTab === "analitik" ? "flex" : "hidden md:flex",
        )}
      >
        {analitikSection}
      </div>

      <div
        className={cn(
          "flex flex-col gap-4 md:gap-5",
          activeTab === "operasional" ? "flex" : "hidden md:flex",
        )}
      >
        {operasionalSection}
      </div>

      <div
        className={cn(
          "flex flex-col gap-4 md:gap-5",
          activeTab === "transaksi" ? "flex" : "hidden md:flex",
        )}
      >
        {transaksiSection}
      </div>
    </div>
  )
}
