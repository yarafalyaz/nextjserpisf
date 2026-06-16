export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { formatDate } from "@/lib/utils/format"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pengguna" }

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("manage_users")
  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const user = await prisma.user.findUnique({
    where: { id: numId },
    include: { roles: true },
  })
  if (!user) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={user.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Pengguna", href: "/pengaturan/pengguna" },
          { label: "Detail" },
        ]}
        actions={<BackButton href="/pengaturan/pengguna" />}
      />

      <DetailCard>
        <DetailField label="Nama" value={user.name} />
        <DetailField label="Email" value={user.email} />
        <DetailField label="Status" value={
          <span className={`status-badge ${user.isActive ? "status-active" : "status-cancelled"}`}>
            {user.isActive ? "Aktif" : "Nonaktif"}
          </span>
        } />
        <DetailField label="Peran" value={user.roles.map((r) => r.name).join(", ") || "-"} />
        <DetailField label="Dibuat" value={formatDate(user.createdAt)} />
      </DetailCard>
    </div>
  )
}
