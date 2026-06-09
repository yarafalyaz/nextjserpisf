export const dynamic = "force-dynamic"

import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { redirect } from "next/navigation"
import { ProfileForm } from "@/components/forms/profile-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Profil" }

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    include: { roles: true },
  })

  if (!user) redirect("/login")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Profil" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Profil</h1>
      </div>
      <ProfileForm
        user={{ id: user.id, name: user.name, email: user.email, avatar: user.avatar }}
        roles={user.roles.map((r) => r.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))}
      />
    </div>
  )
}
