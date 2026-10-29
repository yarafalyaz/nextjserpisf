"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
  createPayrollComponent,
  setPayrollComponentActive,
  updatePayrollComponent,
} from "@/actions/hrm.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"

export interface PayrollComponentMasterRow {
  id: number
  name: string
  kind: string
  recurrence: string
  isTaxable: boolean
  accountId: number | null
  isActive: boolean
}

const KIND_LABEL: Record<string, string> = {
  earning: "Pendapatan",
  deduction: "Potongan",
}

const RECURRENCE_LABEL: Record<string, string> = {
  fixed: "Tetap",
  variable: "Tidak tetap",
}

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind
}

export function recurrenceLabel(recurrence: string): string {
  return RECURRENCE_LABEL[recurrence] ?? recurrence
}

// Klasifikasi kena pajak hanya label master tersimpan tahap ini: mode pajak
// server masih all-taxable-v1, jadi UI dilarang membingkainya sebagai bebas
// pajak aktif dan dilarang mengklaim jurnal per komponen.
export function taxableLabel(isTaxable: boolean, kind: string): string {
  if (kind === "deduction") return "—"
  return isTaxable ? "Kena pajak (klasifikasi)" : "Tidak kena pajak (klasifikasi)"
}

export function PayrollComponentMaster({
  components,
  accounts = [],
}: {
  components: PayrollComponentMasterRow[]
  accounts?: { id: number; code: string; name: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<PayrollComponentMasterRow | null>(null)
  const [kind, setKind] = useState("earning")

  function run(fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      try {
        const result = await fn()
        if (!result.success) {
          showError(result.error || "Gagal menyimpan komponen gaji")
          return
        }
        showSuccess(ok)
        setEditing(null)
        router.refresh()
      } catch {
        showError("Gagal menyimpan komponen gaji")
      }
    })
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    if (editing) {
      run(() => updatePayrollComponent(editing.id, formData), "Komponen gaji berhasil diubah")
    } else {
      run(() => createPayrollComponent(formData), "Komponen gaji berhasil ditambahkan")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-x-auto">
        {components.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Belum ada komponen gaji tercatat.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-default text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Jenis</th>
                <th className="px-4 py-3 font-medium">Sifat</th>
                <th className="px-4 py-3 font-medium">Klasifikasi Pajak</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.id} className="border-b border-default last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-3">{kindLabel(c.kind)}</td>
                  <td className="px-4 py-3">{recurrenceLabel(c.recurrence)}</td>
                  <td className="px-4 py-3">{taxableLabel(c.isTaxable, c.kind)}</td>
                  <td className="px-4 py-3">{c.isActive ? "Aktif" : "Nonaktif"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onPress={() => {
                          setEditing(c)
                          setKind(c.kind)
                        }}
                      >
                        Ubah
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        isDisabled={isPending}
                        aria-label={`${c.isActive ? "Nonaktifkan" : "Aktifkan"} ${c.name}`}
                        onPress={() =>
                          run(
                            () => setPayrollComponentActive(c.id, !c.isActive),
                            c.isActive ? "Komponen gaji dinonaktifkan" : "Komponen gaji diaktifkan",
                          )
                        }
                      >
                        {c.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Klasifikasi kena pajak adalah label tersimpan di master. Tahap ini semua
        pendapatan tetap diperlakukan kena pajak oleh server dan jurnal gaji
        masih agregat — klasifikasi belum mengubah hitungan pajak maupun jurnal.
      </p>

      <form
        onSubmit={onSubmit}
        aria-busy={isPending}
        aria-label={editing ? "Formulir ubah komponen gaji" : "Formulir tambah komponen gaji"}
        className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6"
      >
        <h2 className="mb-4 text-base font-semibold text-foreground">
          {editing ? `Ubah Komponen: ${editing.name}` : "Tambah Komponen Gaji"}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pc-name">
              Nama Komponen <span aria-hidden="true" className="text-destructive">*</span>
            </Label>
            <Input
              id="pc-name"
              name="name"
              required
              defaultValue={editing?.name ?? ""}
              key={editing?.id ?? "new"}
              placeholder="cth. Tunjangan Transport"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pc-kind">Jenis</Label>
            <select
              id="pc-kind"
              name="kind"
              className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="earning">Pendapatan</option>
              <option value="deduction">Potongan</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pc-recurrence">Sifat</Label>
            <select
              id="pc-recurrence"
              name="recurrence"
              className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
              defaultValue={editing?.recurrence ?? "fixed"}
              key={`rec-${editing?.id ?? "new"}`}
            >
              <option value="fixed">Tetap</option>
              <option value="variable">Tidak tetap</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pc-account">Akun Referensi (opsional)</Label>
            {accounts.length > 0 ? (
              <select
                id="pc-account"
                name="accountId"
                className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
                defaultValue={editing?.accountId ?? ""}
                key={`acc-${editing?.id ?? "new"}`}
              >
                <option value="">— Tanpa akun —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="pc-account"
                name="accountId"
                type="number"
                min={1}
                placeholder="ID akun"
                defaultValue={editing?.accountId ?? ""}
                key={`acc-${editing?.id ?? "new"}`}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Hanya disimpan sebagai referensi master; jurnal slip tetap agregat, bukan per komponen.
            </p>
          </div>
        </div>
        {kind === "earning" && (
          <label className="mt-4 flex min-h-11 items-center gap-2 text-sm" htmlFor="pc-taxable">
            <input
              id="pc-taxable"
              type="checkbox"
              name="isTaxable"
              value="true"
              defaultChecked={editing ? editing.isTaxable : true}
              key={`tax-${editing?.id ?? "new"}`}
              className="h-4 w-4"
            />
            Klasifikasi kena pajak
          </label>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {editing && (
            <Button type="button" variant="secondary" onPress={() => setEditing(null)}>
              Batal Ubah
            </Button>
          )}
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambah Komponen"}
          </Button>
        </div>
      </form>
    </div>
  )
}
