import { Eye, Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { auth } from "@/lib/auth/auth"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requirePermission("view_dashboard")
  const session = await auth()
  const params = await searchParams

  const where = {
    ...(params.status && { status: params.status }),
  }

  const approvals = await prisma.approval.findMany({
    where,
    include: { workflow: true, histories: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Settings", href: "/settings" },
  { label: "Approvals" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Approval Workflow</h1>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {["", "pending", "approved", "rejected"].map((s) => (
              <Link key={s} href={`/settings/approvals?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s || "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Reference</th>
                <th>Step</th>
                <th>Status</th>
                <th>Dibuat</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {approvals.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 px-4 text-muted">Tidak ada approval pending</td></tr>
              ) : (
                approvals.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.workflow.name}</td>
                    <td className="font-mono">{a.referenceType} #{a.referenceId}</td>
                    <td>Step {a.currentStep}</td>
                    <td><span className={`status-badge status-${a.status}`}>{a.status}</span></td>
                    <td>{formatDate(a.createdAt)}</td>
                    <td>
                      <Link href={`/settings/approvals/${a.id}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost">Eye</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
