export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { UserCreateForm } from "./_components/user-create-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pengguna" }

export default async function CreateUserPage() {
  await requirePermission("manage_users")

  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Pengguna", href: "/pengaturan/pengguna" },
        { label: "Tambah" },
      ]} />
      <h1 className="text-2xl font-bold text-foreground">Tambah Pengguna Baru</h1>
      <UserCreateForm roles={roles} />
    </div>
  )
}
