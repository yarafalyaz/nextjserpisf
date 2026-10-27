"use client"

import { useEffect, useState } from "react"
import {
  listItemSubstitutes,
  createItemSubstitute,
  setItemSubstituteActive,
} from "@/actions/item-substitute.actions"
import { Button } from "@/components/ui/button"
import { FormSelect } from "@/components/ui/form-select"
import { showError } from "@/lib/utils/toast"
import { useActionRunner } from "@/components/reports/use-action-runner"
import { cn } from "@/lib/utils"

export interface ItemSubstituteRow {
  id: number
  itemId: number
  substituteItemId: number
  substituteName: string
  substituteSku: string
  substituteUnitOfMeasure: string
  substituteIsActive: boolean
  notes: string | null
  isActive: boolean
  createdAt: Date | string
}

export interface SubstituteItemOption {
  id: number
  label: string
}

/**
 * Tab Substitusi master barang (F-2026-10-22-069-S, Q-SUB69-4).
 * Konsumen aksi BOT 3 PR #595: list/create/setActive. Relasi satu arah,
 * nonaktif tampil redup (riwayat utuh), error server verbatim.
 * UI tidak menyimpulkan kelayakan — penjaga server.
 */
export function ItemSubstitutesPanel({
  itemId,
  itemOptions,
  canManage,
}: Readonly<{
  itemId: number
  itemOptions: SubstituteItemOption[]
  canManage: boolean
}>) {
  const { isPending, run } = useActionRunner("Gagal memproses substitusi barang")
  const [rows, setRows] = useState<ItemSubstituteRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [substituteItemId, setSubstituteItemId] = useState("")
  const [notes, setNotes] = useState("")

  async function load() {
    try {
      const res = await listItemSubstitutes(itemId)
      if (res.success) {
        setRows(res.substitutes as ItemSubstituteRow[])
        setLoadError(null)
      } else {
        setLoadError(res.error)
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat substitusi barang")
    }
  }

  useEffect(() => {
    let alive = true
    async function loadSubstitutes() {
      try {
        const res = await listItemSubstitutes(itemId)
        if (!alive) return
        if (res.success) setRows(res.substitutes as ItemSubstituteRow[])
        else setLoadError(res.error)
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : "Gagal memuat substitusi barang")
      }
    }
    void loadSubstitutes()
    return () => {
      alive = false
    }
  }, [itemId])

  function submitCreate() {
    if (!substituteItemId) {
      showError("Barang pengganti wajib dipilih.")
      return
    }
    run(
      () =>
        createItemSubstitute({
          itemId,
          substituteItemId: Number(substituteItemId),
          notes: notes.trim() || null,
        }),
      "Substitusi barang ditambahkan",
      () => {
        setFormOpen(false)
        setSubstituteItemId("")
        setNotes("")
        void load()
      },
    )
  }

  function toggleActive(row: ItemSubstituteRow) {
    run(
      () => setItemSubstituteActive({ id: row.id, isActive: !row.isActive }),
      row.isActive ? "Substitusi dinonaktifkan" : "Substitusi diaktifkan kembali",
      () => void load(),
    )
  }

  return (
    <section aria-label="Substitusi barang" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Pengganti satu arah untuk barang ini. Arah balik dicatat sebagai baris sendiri bila memang sah.
        </p>
        {canManage ? (
          <Button
            variant="primary"
            size="sm"
            isDisabled={isPending}
            onPress={() => setFormOpen((v) => !v)}
          >
            + Tambah Substitusi
          </Button>
        ) : null}
      </div>

      {formOpen && canManage ? (
        <form
          aria-label="Tambah substitusi barang"
          className="flex flex-col gap-3 rounded-lg border border-default p-4"
          onSubmit={(e) => {
            e.preventDefault()
            submitCreate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="substitute-item" className="text-sm font-medium text-foreground">
              Barang pengganti
            </label>
            <FormSelect
              id="substitute-item"
              aria-label="Barang pengganti"
              value={substituteItemId}
              onValueChange={setSubstituteItemId}
              placeholder="-- Pilih barang pengganti --"
              options={itemOptions
                .filter((o) => o.id !== itemId)
                .map((o) => ({ value: String(o.id), label: o.label }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="substitute-notes" className="text-sm font-medium text-foreground">
              Catatan kesetaraan
            </label>
            <textarea
              id="substitute-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-default bg-surface px-3 py-2 text-sm"
              placeholder="Mis. setara fungsi, beda merek"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" isDisabled={isPending || !substituteItemId}>
              Simpan Substitusi
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isDisabled={isPending}
              onPress={() => setFormOpen(false)}
            >
              Batal
            </Button>
          </div>
        </form>
      ) : null}

      {loadError ? (
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      ) : rows === null ? (
        <p className="text-sm text-muted-foreground">Memuat substitusi…</p>
      ) : rows.length === 0 ? (
        <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          Belum ada substitusi tercatat untuk barang ini
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1 pr-2 font-medium">Barang pengganti</th>
                <th scope="col" className="py-1 pr-2 font-medium">SKU</th>
                <th scope="col" className="py-1 pr-2 font-medium">Satuan</th>
                <th scope="col" className="py-1 pr-2 font-medium">Catatan</th>
                <th scope="col" className="py-1 pr-2 font-medium">Status relasi</th>
                <th scope="col" className="py-1 font-medium">Status barang</th>
                {canManage ? <th scope="col" className="py-1 font-medium">Aksi</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn("border-t border-default", !row.isActive && "opacity-60")}
                >
                  <td className="py-2 pr-2">{row.substituteName}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{row.substituteSku}</td>
                  <td className="py-2 pr-2">{row.substituteUnitOfMeasure}</td>
                  <td className="py-2 pr-2">{row.notes ?? "-"}</td>
                  <td className="py-2 pr-2">{row.isActive ? "Aktif" : "Nonaktif"}</td>
                  <td className="py-2 pr-2">{row.substituteIsActive ? "Aktif" : "Nonaktif"}</td>
                  {canManage ? (
                    <td className="py-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        isDisabled={isPending}
                        onPress={() => toggleActive(row)}
                      >
                        {row.isActive ? "Nonaktifkan" : "Aktifkan kembali"}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!canManage ? (
        <p role="note" className="text-xs text-muted-foreground">
          Hanya pengguna berizin edit_items yang dapat mengelola substitusi barang ini.
        </p>
      ) : null}
    </section>
  )
}
