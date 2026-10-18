export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { redirect } from "next/navigation"
import { ProfileForm } from "@/components/forms/profile-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requireAuth } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Profil" }

export default async function ProfilePage() {
  await requireAuth()

  const userSession = await requireAuth()

  const user = await prisma.user.findUnique({
    where: { id: Number(userSession.id) },
    include: { roles: true },
  })

  if (!user) redirect("/login")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Profil" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Profil</h1>
      </div>
      <ProfileForm
        user={{ id: user.id, name: user.name, email: user.email, avatar: user.avatar }}
        roles={user.roles.map((r) => r.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))}
      />
    </div>
  )
}
