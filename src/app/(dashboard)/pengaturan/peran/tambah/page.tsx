export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { createRole } from "@/actions/roles.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import Link from "next/link"
import { Checkbox } from "@/components/ui/shadcn/checkbox"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Peran" }

export default async function CreateRolePage() {
  await requirePermission("manage_settings")

  const permissions = await prisma.permission.findMany({
    orderBy: { name: "asc" },
  })

  // Group permissions by prefix (e.g. manage_, view_, create_)
  const grouped = permissions.reduce((acc, perm) => {
    const prefix = perm.name.split("_")[0] || "other"
    if (!acc[prefix]) acc[prefix] = []
    acc[prefix].push(perm)
    return acc
  }, {} as Record<string, typeof permissions>)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Peran", href: "/pengaturan/peran" },
        { label: "Tambah Peran" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Peran</h1>
      </div>

      <form action={createRole} className="flex flex-col gap-6">
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
          <div className="flex flex-col gap-4 max-w-md">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-medium text-foreground">Nama Peran</label>
              <input
                type="text"
                id="name"
                name="name"
                required
                placeholder="Contoh: admin, manager, staff"
                className="w-full px-3 py-2.5 rounded-lg border border-default bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
          <h2 className="text-[0.9375rem] font-semibold text-foreground mb-4">Tetapkan Hak Akses</h2>
          <div className="flex flex-col gap-5">
            {Object.entries(grouped).map(([prefix, perms]) => (
              <div key={prefix}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 capitalize">{prefix}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                  {perms.map((perm) => (
                    <label key={perm.id} htmlFor={`perm-${perm.id}`} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-default hover:bg-surface-secondary transition-all cursor-pointer">
                      <Checkbox id={`perm-${perm.id}`} name="permissions" value={String(perm.id)} />
                      <span className="text-sm text-foreground">{perm.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
            Simpan Peran
          </button>
          <Link href="/pengaturan/peran" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-default transition-all hover:bg-surface-secondary">
            Batal
          </Link>
        </div>
      </form>
    </div>
  )
}
