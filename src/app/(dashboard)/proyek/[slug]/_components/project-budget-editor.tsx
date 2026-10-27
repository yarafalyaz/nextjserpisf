"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import {
  createProjectBudgetItem,
  updateProjectBudgetItem,
  deleteProjectBudgetItem,
  lockProjectBudget,
  setProjectContractManual,
  setProjectContractFromQuotation,
  proposeProjectBudgetRevision,
  applyProjectBudgetRevision,
  rejectProjectBudgetRevision,
} from "@/actions/project.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { formatCurrency } from "@/lib/utils/format"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"

export interface BudgetItemRow {
  id: number
  projectStageId: number | null
  category: string | null
  description: string | null
  qty: number
  cost: number
  sortOrder: number
}
export interface BudgetStageOption { id: number; name: string }
export interface BudgetQuotationOption { id: number; documentNo: string; grandTotal: number }
export interface BudgetProposal {
  logId: number
  reason: string
  changesJson: string
}

const CATEGORIES = [
  { value: "material", label: "Material" },
  { value: "labor", label: "Tenaga Kerja" },
  { value: "subkontrak", label: "Subkontrak" },
  { value: "lain", label: "Lain-lain" },
]

interface Props {
  projectId: number
  items: BudgetItemRow[]
  stages: BudgetStageOption[]
  quotations: BudgetQuotationOption[]
  isLocked: boolean
  canEdit: boolean
  canManage: boolean
  pendingProposal: BudgetProposal | null
}

export function ProjectBudgetEditor({ projectId, items, stages, quotations, isLocked, canEdit, canManage, pendingProposal }: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<BudgetItemRow | null>(null)
  const [confirm, setConfirm] = useState<null | { title: string; body: string; label: string; run: () => Promise<{ success: boolean; error?: string }> }>(null)
  // form tambah/ubah baris
  const [stageId, setStageId] = useState("")
  const [category, setCategory] = useState("")
  const [revReason, setRevReason] = useState("")
  const [manualAmount, setManualAmount] = useState("")
  const [manualReason, setManualReason] = useState("")
  const [quotationId, setQuotationId] = useState("")
  const [rejectReason, setRejectReason] = useState("")

  const stageOptions = useMemo(() => [{ value: "", label: "Belum dialokasi (tanpa tahap)" }, ...stages.map((s) => ({ value: String(s.id), label: s.name }))], [stages])
  const catOptions = useMemo(() => [{ value: "", label: "Tanpa kategori" }, ...CATEGORIES], [])

  function run(promise: Promise<{ success: boolean; error?: string }>, okMsg: string, after?: () => void) {
    startTransition(async () => {
      const res = await promise
      if (!res.success) { showError(res.error || "Gagal menyimpan RAB"); return }
      showSuccess(okMsg)
      after?.()
      setConfirm(null)
      router.refresh()
    })
  }

  function submitItem(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (stageId) fd.set("projectStageId", stageId); else fd.delete("projectStageId")
    if (category) fd.set("category", category); else fd.delete("category")
    if (isLocked) {
      // Terkunci: edit langsung ditolak server — kirim sebagai usulan revisi.
      if (!revReason.trim()) { showError("Alasan revisi wajib diisi untuk RAB terkunci"); return }
      const data = { projectStageId: stageId ? Number(stageId) : undefined, category: category || undefined, description: String(fd.get("description") || "") || undefined, qty: Number(fd.get("qty")), cost: Number(fd.get("cost")) }
      const changes = editing ? [{ type: "update", projectItemId: editing.id, data }] : [{ type: "create", data }]
      const rfd = new FormData(); rfd.set("reason", revReason); rfd.set("changes", JSON.stringify({ changes }))
      run(proposeProjectBudgetRevision(projectId, rfd), "Usulan revisi RAB terkirim", () => { setEditing(null); setRevReason("") })
      return
    }
    if (editing) { fd.set("id", String(editing.id)); run(updateProjectBudgetItem(fd), "Baris RAB diubah", () => setEditing(null)) }
    else run(createProjectBudgetItem(projectId, fd), "Baris RAB ditambahkan", () => { setStageId(""); setCategory("") })
  }

  if (!canEdit && !canManage) return null

  return (
    <section aria-label="Kelola RAB" className="mt-4 border-t border-default/50 pt-3">
      <h3 className="text-sm font-semibold text-foreground">Kelola RAB</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {isLocked ? "RAB terkunci: perubahan baris dikirim sebagai usulan revisi, diterapkan/ditolak oleh pengelola proyek." : "RAB belum terkunci: baris dapat ditambah, diubah, dihapus langsung."}
      </p>

      {items.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Deskripsi</th><th className="py-1 pr-2 font-medium">Tahap</th>
              <th className="py-1 pr-2 font-medium">Kategori</th><th className="py-1 pr-2 text-right font-medium">Qty</th>
              <th className="py-1 pr-2 text-right font-medium">Biaya Satuan</th><th className="py-1 text-right font-medium">Aksi</th>
            </tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-default/50">
                  <td className="py-1.5 pr-2">{it.description || `Baris #${it.id}`}</td>
                  <td className="py-1.5 pr-2">{stages.find((s) => s.id === it.projectStageId)?.name ?? "Belum dialokasi"}</td>
                  <td className="py-1.5 pr-2">{CATEGORIES.find((c) => c.value === it.category)?.label ?? "Tanpa kategori"}</td>
                  <td className="py-1.5 pr-2 text-right">{it.qty}</td>
                  <td className="py-1.5 pr-2 text-right">{formatCurrency(it.cost)}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {canEdit && <Button type="button" variant="secondary" isDisabled={isPending} onClick={() => { setEditing(it); setStageId(it.projectStageId ? String(it.projectStageId) : ""); setCategory(it.category ?? "") }}>Ubah</Button>}
                    {canEdit && (isLocked ? (
                      <Button type="button" variant="secondary" isDisabled={isPending} onClick={() => {
                        if (!revReason.trim()) { showError("Isi alasan revisi di formulir baris dulu, lalu klik Hapus (usulan)"); setEditing(it); return }
                        const rfd = new FormData(); rfd.set("reason", revReason); rfd.set("changes", JSON.stringify({ changes: [{ type: "delete", projectItemId: it.id }] }))
                        setConfirm({ title: "Usulkan hapus baris RAB?", body: `Baris "${it.description || it.id}" diusulkan dihapus lewat revisi.`, label: "Kirim Usulan", run: () => proposeProjectBudgetRevision(projectId, rfd) })
                      }}>Hapus (usulan)</Button>
                    ) : (
                      <Button type="button" variant="secondary" isDisabled={isPending} onClick={() => setConfirm({ title: "Hapus baris RAB?", body: `Baris "${it.description || it.id}" akan dihapus permanen.`, label: "Hapus", run: () => deleteProjectBudgetItem(it.id) })}>Hapus</Button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <form onSubmit={submitItem} aria-label={editing ? "Ubah baris RAB" : "Tambah baris RAB"} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5"><Label htmlFor="rabStage">Tahap</Label><FormSelect id="rabStage" value={stageId} onValueChange={setStageId} options={stageOptions} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="rabCategory">Kategori</Label><FormSelect id="rabCategory" value={category} onValueChange={setCategory} options={catOptions} /></div>
          <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="rabDesc">Deskripsi</Label><Input id="rabDesc" name="description" defaultValue={editing?.description ?? ""} key={editing?.id ?? "new"} placeholder="Deskripsi baris RAB" /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="rabQty">Qty</Label><Input id="rabQty" name="qty" type="number" step="0.01" min="0" required defaultValue={editing?.qty ?? ""} key={`q-${editing?.id ?? "new"}`} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="rabCost">Biaya Satuan (Rp)</Label><Input id="rabCost" name="cost" type="number" step="0.01" min="0" required defaultValue={editing?.cost ?? ""} key={`c-${editing?.id ?? "new"}`} /></div>
          {isLocked && <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="rabRevReason">Alasan Revisi</Label><Textarea id="rabRevReason" value={revReason} onChange={(e) => setRevReason(e.target.value)} rows={2} placeholder="Wajib untuk RAB terkunci" /></div>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : editing ? (isLocked ? "Kirim Usulan Ubah" : "Simpan Perubahan") : (isLocked ? "Kirim Usulan Tambah" : "Tambah Baris RAB")}</Button>
            {editing && <Button type="button" variant="secondary" isDisabled={isPending} onClick={() => setEditing(null)}>Batal</Button>}
          </div>
        </form>
      )}

      {!isLocked && canEdit && (
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-default/50 pt-3 sm:grid-cols-2">
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(); fd.set("contractAmount", manualAmount); fd.set("reason", manualReason); run(setProjectContractManual(projectId, fd), "Nilai kontrak manual tersimpan", () => { setManualAmount(""); setManualReason("") }) }} aria-label="Nilai kontrak manual" className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-foreground">Nilai Kontrak Manual</span>
            <div className="flex flex-col gap-1.5"><Label htmlFor="rabManualAmount">Nilai Kontrak (Rp)</Label><Input id="rabManualAmount" type="number" min="0" required value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="rabManualReason">Alasan</Label><Input id="rabManualReason" required value={manualReason} onChange={(e) => setManualReason(e.target.value)} /></div>
            <Button type="submit" variant="secondary" isDisabled={isPending}>Simpan Kontrak Manual</Button>
          </form>
          {quotations.length > 0 && (
            <form onSubmit={(e) => { e.preventDefault(); if (!quotationId) { showError("Pilih penawaran sumber kontrak"); return } run(setProjectContractFromQuotation(projectId, Number(quotationId)), "Kontrak dari penawaran tersimpan") }} aria-label="Kontrak dari penawaran" className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-foreground">Kontrak dari Penawaran</span>
              <div className="flex flex-col gap-1.5"><Label htmlFor="rabQuotation">Penawaran (disetujui)</Label><FormSelect id="rabQuotation" value={quotationId} onValueChange={setQuotationId} options={quotations.map((q) => ({ value: String(q.id), label: `${q.documentNo} — ${formatCurrency(q.grandTotal)}` }))} /></div>
              <Button type="submit" variant="secondary" isDisabled={isPending}>Pakai Penawaran Ini</Button>
            </form>
          )}
        </div>
      )}

      {!isLocked && canManage && (
        <div className="mt-4">
          <Button type="button" variant="primary" isDisabled={isPending} onClick={() => setConfirm({ title: "Kunci RAB?", body: "Sesudah terkunci, baris hanya berubah lewat revisi yang disetujui pengelola proyek. Server menolak kunci bila kontrak/baris belum sah.", label: "Kunci RAB", run: () => lockProjectBudget(projectId) })}>Kunci RAB</Button>
        </div>
      )}

      {isLocked && pendingProposal && (
        <div className="mt-4 border-t border-default/50 pt-3" aria-label="Usulan revisi menunggu keputusan">
          <p className="text-xs text-foreground"><span className="font-semibold">Usulan revisi menunggu:</span> {pendingProposal.reason || "-"}</p>
          <pre className="mt-1 max-h-32 overflow-auto text-[11px] text-muted-foreground">{pendingProposal.changesJson}</pre>
          {canManage ? (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex gap-2">
                <Button type="button" variant="primary" isDisabled={isPending} onClick={() => setConfirm({ title: "Terapkan revisi RAB?", body: "Perubahan usulan diterapkan dan nomor revisi naik.", label: "Terapkan Revisi", run: () => applyProjectBudgetRevision(projectId, pendingProposal.logId) })}>Terapkan Revisi</Button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(); fd.set("reason", rejectReason); run(rejectProjectBudgetRevision(projectId, pendingProposal.logId, fd), "Usulan revisi ditolak", () => setRejectReason("")) }} aria-label="Tolak usulan revisi" className="flex flex-col gap-1.5 sm:flex-row sm:items-end">
                <div className="flex flex-1 flex-col gap-1.5"><Label htmlFor="rabRejectReason">Alasan Penolakan</Label><Input id="rabRejectReason" required value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /></div>
                <Button type="submit" variant="secondary" isDisabled={isPending}>Tolak Revisi</Button>
              </form>
            </div>
          ) : <p className="mt-1 text-xs text-muted-foreground">Menunggu keputusan pengelola proyek (izin manage_projects).</p>}
        </div>
      )}

      <ConfirmDialog isOpen={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null) }} title={confirm?.title ?? ""} body={confirm?.body} confirmLabel={confirm?.label} variant="primary" isPending={isPending} onConfirm={() => { if (confirm) run(confirm.run(), "Berhasil") }} />
    </section>
  )
}
