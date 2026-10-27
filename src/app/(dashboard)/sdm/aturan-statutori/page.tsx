export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requireAnyPermission } from "@/lib/auth/permissions"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { DeleteButton } from "@/components/ui/delete-button"
import { CanCreate } from "@/components/auth/can-create"
import { StatutoryRuleForm, CloseRuleForm } from "./_components/statutory-rule-forms"
import { deleteStatutoryRule } from "@/actions/hrm.actions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Aturan Statutori" }

/**
 * Aturan statutori payroll berperiode (`payroll_statutory_rules`).
 *
 * Halaman ini SATU-SATUNYA jalur tulis tabel tersebut. Sebelumnya tarif hanya
 * konstanta kode (aturan 2024) tanpa periode — slip historis tak bisa
 * direproduksi dan perubahan tarif tak tercatat. Perubahan = baris BARU
 * (berlaku sejak baru + tutup baris lama); edit value baris lama tidak
 * disediakan, baris historis tidak bisa dihapus. Angka 2026+ NEEDS
 * ACCOUNTANT/LEGAL CONFIRMATION sebelum dimasukkan.
 */
export default async function StatutoryRulesPage() {
  await requireAnyPermission(["view_payroll", "create_payroll", "edit_payroll"])

  const rules = await prisma.payrollStatutoryRule.findMany({
    orderBy: [{ key: "asc" }, { effectiveFrom: "desc" }],
    take: 300,
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Aturan Statutori"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Aturan Statutori" },
        ]}
      />

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Tambah Aturan</h2>
            <p className="text-xs text-muted-foreground">
              Baris baru berlaku sejak tanggal yang diisi. Untuk mengubah tarif: tutup
              baris lama dengan tanggal akhir, lalu tambah baris baru.
            </p>
          </div>
        </div>
        <StatutoryRuleForm />
        <div className="p-4 px-5">
          {rules.length === 0 ? (
            <EmptyState title="Belum ada aturan — hitungan memakai bawaan 2024 dari kode" className="py-10" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Kunci</DetailTableTh>
                <DetailTableTh>Nilai</DetailTableTh>
                <DetailTableTh>Berlaku Sejak</DetailTableTh>
                <DetailTableTh>Berlaku Sampai</DetailTableTh>
                <DetailTableTh>Sumber</DetailTableTh>
                <DetailTableTh align="right">Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {rules.map((rule) => (
                  <DetailTableRow key={rule.id}>
                    <DetailTableTd>{rule.key}</DetailTableTd>
                    <DetailTableTd>{String(rule.value)}</DetailTableTd>
                    <DetailTableTd>{rule.effectiveFrom.toISOString().split("T")[0]}</DetailTableTd>
                    <DetailTableTd>
                      {rule.effectiveTo ? rule.effectiveTo.toISOString().split("T")[0] : "—"}
                    </DetailTableTd>
                    <DetailTableTd>{rule.source ?? "—"}</DetailTableTd>
                    <DetailTableTd align="right">
                      <div className="flex justify-end gap-2">
                        {!rule.effectiveTo && <CloseRuleForm id={rule.id} />}
                        <CanCreate permission="edit_payroll">
                          <DeleteButton id={rule.id} action={deleteStatutoryRule} />
                        </CanCreate>
                      </div>
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  )
}
