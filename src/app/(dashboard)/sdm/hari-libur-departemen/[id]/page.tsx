export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteDepartmentHoliday } from "@/actions/hrm.actions"

export default async function DepartmentHolidayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const holiday = await prisma.departmentHoliday.findUnique({
    where: { id: Number(id) },
    include: { department: true },
  })

  if (!holiday) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Hari Libur Departemen</h1>
        <div className="flex gap-2">
          <Link href={`/sdm/hari-libur-departemen/${holiday.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Ubah</Link>
          <DeleteButton id={holiday.id} action={deleteDepartmentHoliday} />
          <Link href="/sdm/hari-libur-departemen" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{holiday.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Departemen</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{holiday.department.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(holiday.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Berulang</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium w-fit ${holiday.isRecurring ? "bg-success/10 text-success" : "bg-default/10 text-muted"}`}>
              {holiday.isRecurring ? "Ya" : "Tidak"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(holiday.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
