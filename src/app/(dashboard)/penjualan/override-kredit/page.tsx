export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { listCreditOverrides } from "@/actions/credit-override.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  CreditOverrideQueue,
  type CreditOverrideRow,
} from "@/components/reports/credit-override-queue"
import { hasPermission, requireAuth } from "@/lib/auth/permissions"
import type { PermissionName } from "@/lib/setup/base-data"

export const metadata: Metadata = { title: "Override Batas Kredit" }

/**
 * F-2026-10-25-035-F: permukaan persetujuan + jejak override gerbang kredit.
 * Baca dijaga server oleh listCreditOverrides (approve_credit_overrides ATAU
 * view_reports, fail-closed); halaman TIDAK memanggil loader tanpa salah satu
 * izin itu. Setujui/Tolak hanya dirender untuk pemegang
 * approve_credit_overrides; SoD + alasan tolak wajib ditegakkan server dan
 * penolakannya tampil verbatim. Izin approve_credit_overrides lahir di PR
 * Backend #1072 (MERGED) — literal langsung tanpa cast.
 */
const APPROVE_CREDIT_OVERRIDES: PermissionName = "approve_credit_overrides"

export default async function CreditOverridePage() {
  const [canApprove, canReport] = await Promise.all([
    hasPermission(APPROVE_CREDIT_OVERRIDES),
    hasPermission("view_reports"),
  ])
  const canRead = canApprove || canReport

  const [result, user] = canRead
    ? await Promise.all([listCreditOverrides(), requireAuth()])
    : [{ success: false as const, error: "Anda tidak memiliki izin melihat override batas kredit" }, null]

  const rows: CreditOverrideRow[] = result.success
    ? result.data.map((row: CreditOverrideRow) => ({
        ...row,
        decidedAt: row.decidedAt ? new Date(row.decidedAt).toISOString() : null,
        expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
      }))
    : []

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Override Batas Kredit" },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Override Batas Kredit</h1>
      {!canRead ? (
        <p role="alert" className="rounded-xl border border-default bg-surface p-6 text-sm text-danger">
          Anda tidak memiliki izin melihat override batas kredit
        </p>
      ) : !result.success ? (
        <p role="alert" className="rounded-xl border border-default bg-surface p-6 text-sm text-danger">
          {result.error}
        </p>
      ) : (
        <CreditOverrideQueue
          rows={rows}
          canApprove={canApprove}
          currentUserId={user ? Number(user.id) : null}
        />
      )}
    </div>
  )
}
