"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Users,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Pencil,
  ExternalLink,
} from "@/components/ui/fontawesome-icons"
import type { CustomerDuplicateCandidateView } from "@/components/forms/customer-duplicate-warning"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

export interface CustomerDuplicateGroupView {
  matchKind: "npwp" | "phone" | "name_secondary"
  matchLabel: string
  key: string
  members: CustomerDuplicateCandidateView[]
}

const KIND_CONFIG: Record<
  CustomerDuplicateGroupView["matchKind"],
  { label: string; badgeClass: string; rowBorder: string }
> = {
  npwp: {
    label: "NPWP",
    badgeClass: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50",
    rowBorder: "border-l-red-500",
  },
  phone: {
    label: "Telepon",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
    rowBorder: "border-l-amber-500",
  },
  name_secondary: {
    label: "Nama Serupa",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50",
    rowBorder: "border-l-blue-500",
  },
}

export function CustomerDuplicateGroups({
  groups,
}: {
  groups: CustomerDuplicateGroupView[]
}) {
  const visible = groups.filter((group) => group.members.length >= 2)
  const [isOpen, setIsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<string>("all")

  if (visible.length === 0) return null

  const filteredGroups = activeTab === "all"
    ? visible
    : visible.filter((g) => g.matchKind === activeTab)

  const totalDuplicateRecords = visible.reduce((acc, g) => acc + g.members.length, 0)

  return (
    <div
      aria-label="Kandidat pelanggan ganda"
      className="rounded-lg border border-border bg-card shadow-xs transition-colors"
    >
      {/* Summary Trigger Bar */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <Users className="size-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Kandidat Pelanggan Ganda
              </h2>
              <span className="inline-flex items-center rounded-md border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-300">
                {visible.length} grup ({totalDuplicateRecords} data terindikasi)
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Terdeteksi data kontak atau nomor pajak yang sama pada beberapa pelanggan.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center justify-center gap-1.5 self-start sm:self-auto rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <>
              Tutup Daftar <ChevronUp className="size-3 text-muted-foreground" aria-hidden="true" />
            </>
          ) : (
            <>
              Periksa Duplikat <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
            </>
          )}
        </button>
      </div>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/10">
          {/* Tab Filter */}
          {visible.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
              <span className="text-xs font-medium text-muted-foreground mr-1">Tapis kategori:</span>
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === "all"
                    ? "bg-foreground text-background font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                Semua ({visible.length})
              </button>
              {(["npwp", "phone", "name_secondary"] as const).map((kind) => {
                const count = visible.filter((g) => g.matchKind === kind).length
                if (count === 0) return null
                const meta = KIND_CONFIG[kind]
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setActiveTab(kind)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      activeTab === kind
                        ? "bg-foreground text-background font-semibold"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {meta.label} ({count})
                  </button>
                )
              })}
            </div>
          )}

          {/* Table Comparison View */}
          <div className="space-y-4">
            {filteredGroups.map((group) => {
              const meta = KIND_CONFIG[group.matchKind]
              return (
                <div
                  key={`${group.matchKind}-${group.key}`}
                  className="rounded-md border border-border bg-card overflow-hidden"
                >
                  {/* Group Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3.5 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {group.matchLabel}: {group.key} ({group.members.length} pelanggan)
                      </span>
                    </div>
                  </div>

                  {/* Compact Tabular Records */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/20 text-muted-foreground font-medium">
                          <th className="py-2 px-3">Nama Pelanggan</th>
                          <th className="py-2 px-3">Kode</th>
                          <th className="py-2 px-3">No. Telepon</th>
                          <th className="py-2 px-3">NPWP</th>
                          <th className="py-2 px-3">Email</th>
                          <th className="py-2 px-3 text-right">Aksi Penyesuaian</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {group.members.map((member) => (
                          <tr key={member.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 px-3 font-medium text-foreground">
                              {member.name}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                              {member.code || "-"}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                              {member.phone || "-"}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                              {member.taxId || "-"}
                            </td>
                            <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[180px]">
                              {member.email || "-"}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <Link
                                  href={entityEditHref("/master/pelanggan", member)}
                                  className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium text-primary hover:bg-primary/10 transition-colors"
                                  title="Ubah master pelanggan"
                                >
                                  <Pencil className="size-3" aria-hidden="true" />
                                  <span>Ubah {member.name}</span>
                                </Link>
                                <Link
                                  href={entityHref("/master/pelanggan", member)}
                                  className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                  title="Buka detail pelanggan"
                                >
                                  <ExternalLink className="size-3" aria-hidden="true" />
                                  <span>Detail {member.name}</span>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
