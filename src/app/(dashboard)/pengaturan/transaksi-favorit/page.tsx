export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { flattenNavigation } from "@/components/layout/navigation"
import { FavoriteManager } from "./_components/favorite-manager"

export const metadata: Metadata = { title: "Transaksi Favorit" }

export default async function FavoriteTransactionsPage() {
  const user = await requirePermission("manage_favorite_transactions")

  const favorites = await prisma.favoriteTransaction.findMany({
    where: { userId: Number(user.id) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, label: true, href: true },
  })

  // Saran tautan diambil dari menu yang ada, supaya pintasan tidak menunjuk
  // halaman yang tidak pernah ada.
  const suggestions = flattenNavigation().map((entry) => ({
    href: entry.href,
    label: `${entry.group} › ${entry.label}`,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Transaksi Favorit" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Transaksi Favorit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pintasan pribadi ke halaman transaksi yang sering dibuka. Favorit hanya terlihat oleh
            pengguna yang membuatnya.
          </p>
        </div>
      </div>

      <FavoriteManager favorites={favorites} suggestions={suggestions} />
    </div>
  )
}
