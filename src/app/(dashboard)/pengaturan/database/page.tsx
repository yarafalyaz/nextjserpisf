export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getBackups } from "@/actions/database.actions"
import { BackupManager } from "./_components/backup-manager"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Database" }

export default async function DatabaseBackupPage() {
  await requirePermission("manage_settings")
  const backups = await getBackups()

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Backup & Restore Database" },
      ]} />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Backup &amp; Restore Database</h1>
        <p className="text-sm text-muted-foreground">
          Buat cadangan database, unduh, atau pulihkan dari backup sebelumnya.
        </p>
      </div>
      <BackupManager initialBackups={backups} />
    </div>
  )
}
