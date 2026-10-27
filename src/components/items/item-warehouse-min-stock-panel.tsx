"use client"

import { useEffect, useState } from "react"
import {
  listItemWarehouseSettings,
  setItemWarehouseMinStock,
  removeItemWarehouseMinStock,
  setItemWarehouseLeadTime,
  removeItemWarehouseLeadTime,
  type ItemWarehouseSettingRow,
} from "@/actions/item-warehouse-setting.actions"
import { formatNumber } from "@/lib/utils/format"
import { Button } from "@/components/ui/button"
import { showError } from "@/lib/utils/toast"
import { useActionRunner } from "@/components/reports/use-action-runner"

/**
 * Panel "Stok minimum per gudang" detail barang persediaan
 * (F-2026-10-22-070-E, konsumen inti PR #694).
 *
 * Angka + label sumber dari loader backend apa adanya (BR-MS-02/04):
 * UI tidak menghitung minimum efektif — `effectiveMinStock` dan
 * `minStockSource` ditampilkan verbatim. Label sumber diteruskan page
 * RSC sebagai props dari konstanta MIN_STOCK_OVERRIDE_LABEL /
 * MIN_STOCK_GLOBAL_LABEL (`@/lib/reports/min-stock-data`, modul server
 * ber-prisma — tidak diimpor komponen client ini). Kontrol ubah
 * hanya tampil bila `canManage` (izin sesi nyata `edit_items` dari
 * page); penjaga server tetap otoritas. Error server verbatim.
 */
export function ItemWarehouseMinStockPanel({
  itemId,
  canManage,
  overrideLabel,
  globalLabel,
}: Readonly<{
  itemId: number
  canManage: boolean
  overrideLabel: string
  globalLabel: string
}>) {
  const { isPending, run } = useActionRunner("Gagal memproses stok minimum per gudang")
  const [rows, setRows] = useState<ItemWarehouseSettingRow[] | null>(null)
  const [globalMinStock, setGlobalMinStock] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [leadTimeDrafts, setLeadTimeDrafts] = useState<Record<number, string>>({})

  async function load() {
    try {
      const res = await listItemWarehouseSettings(itemId)
      if (res.success) {
        setRows(res.rows)
        setGlobalMinStock(res.globalMinStock)
        setDrafts(
          Object.fromEntries(
            res.rows.map((r) => [r.warehouseId, String(r.overrideMinStock ?? r.effectiveMinStock)]),
          ),
        )
        setLeadTimeDrafts(
          Object.fromEntries(
            res.rows.map((r) => [r.warehouseId, r.leadTimeDays == null ? "" : String(r.leadTimeDays)]),
          ),
        )
        setLoadError(null)
      } else {
        setLoadError(res.error)
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat stok minimum per gudang")
    }
  }

  useEffect(() => {
    let alive = true
    async function loadSettings() {
      try {
        const res = await listItemWarehouseSettings(itemId)
        if (!alive) return
        if (res.success) {
          setRows(res.rows)
          setGlobalMinStock(res.globalMinStock)
          setDrafts(
            Object.fromEntries(
              res.rows.map((r) => [r.warehouseId, String(r.overrideMinStock ?? r.effectiveMinStock)]),
            ),
          )
          setLeadTimeDrafts(
            Object.fromEntries(
              res.rows.map((r) => [r.warehouseId, r.leadTimeDays == null ? "" : String(r.leadTimeDays)]),
            ),
          )
        } else {
          setLoadError(res.error)
        }
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : "Gagal memuat stok minimum per gudang")
      }
    }
    void loadSettings()
    return () => {
      alive = false
    }
  }, [itemId])

  function submitSave(row: ItemWarehouseSettingRow) {
    const raw = (drafts[row.warehouseId] ?? "").trim().replace(",", ".")
    const value = Number(raw)
    if (raw === "" || !Number.isFinite(value) || value < 0) {
      showError("Stok minimum per gudang wajib angka 0 atau lebih")
      return
    }
    run(
      () => setItemWarehouseMinStock(itemId, row.warehouseId, value),
      "Stok minimum per gudang tersimpan",
      () => void load(),
    )
  }

  function submitSaveLeadTime(row: ItemWarehouseSettingRow) {
    const raw = (leadTimeDrafts[row.warehouseId] ?? "").trim()
    const value = Number(raw)
    if (raw === "" || !Number.isInteger(value) || value < 0) {
      showError("Lead time wajib bilangan bulat 0 hari atau lebih")
      return
    }
    run(
      () => setItemWarehouseLeadTime(itemId, row.warehouseId, value),
      "Lead time tersimpan",
      () => void load(),
    )
  }

  function submitRemoveLeadTime(row: ItemWarehouseSettingRow) {
    run(
      () => removeItemWarehouseLeadTime(itemId, row.warehouseId),
      "Lead time dihapus; pasangan tidak dinilai untuk titik pesan-ulang",
      () => void load(),
    )
  }

  function submitRemove(row: ItemWarehouseSettingRow) {
    run(
      () => removeItemWarehouseMinStock(itemId, row.warehouseId),
      "Stok minimum per gudang dihapus; kembali ke minimum global",
      () => void load(),
    )
  }

  return (
    <section aria-label="Stok minimum per gudang" className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Minimum efektif per gudang: override per gudang bila diatur, selain itu warisi minimum global
        {globalMinStock !== null ? ` (${formatNumber(globalMinStock)})` : ""}. Pasangan tanpa lapisan stok
        tidak dinilai.
      </p>

      {loadError ? (
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      ) : rows === null ? (
        <p className="text-sm text-muted-foreground">Memuat stok minimum per gudang…</p>
      ) : rows.length === 0 ? (
        <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          Belum ada gudang aktif untuk diatur stok minimumnya
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1 pr-2 font-medium">Gudang</th>
                <th scope="col" className="py-1 pr-2 font-medium">Stok di gudang</th>
                <th scope="col" className="py-1 pr-2 font-medium">Minimum efektif</th>
                <th scope="col" className="py-1 pr-2 font-medium">Sumber minimum</th>
                <th scope="col" className="py-1 pr-2 font-medium">Lead time (hari)</th>
                {canManage ? (
                  <>
                    <th scope="col" className="py-1 pr-2 font-medium">Atur minimum</th>
                    <th scope="col" className="py-1 font-medium">Atur lead time</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const inputId = `min-stock-gudang-${row.warehouseId}`
                const leadTimeInputId = `lead-time-gudang-${row.warehouseId}`
                return (
                  <tr key={row.warehouseId} className="border-t border-default">
                    <td className="py-2 pr-2">
                      {row.warehouseName}
                      {row.warehouseCode ? (
                        <span className="text-xs text-muted-foreground"> ({row.warehouseCode})</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2">
                      {row.qtyAtWarehouse === null ? (
                        <>
                          — <span className="text-xs text-muted-foreground">tidak ada stok di gudang ini</span>
                        </>
                      ) : (
                        formatNumber(row.qtyAtWarehouse)
                      )}
                    </td>
                    <td className="py-2 pr-2">{formatNumber(row.effectiveMinStock)}</td>
                    <td className="py-2 pr-2">
                      {row.minStockSource === "override" ? overrideLabel : globalLabel}
                    </td>
                    <td className="py-2 pr-2">
                      {row.leadTimeDays == null ? (
                        <>
                          — <span className="text-xs text-muted-foreground">belum diisi</span>
                        </>
                      ) : (
                        formatNumber(row.leadTimeDays)
                      )}
                    </td>
                    {canManage ? (
                      <>
                        <td className="py-2 pr-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor={inputId} className="sr-only">
                            Stok minimum di {row.warehouseName}
                          </label>
                          <input
                            id={inputId}
                            aria-label={`Stok minimum di ${row.warehouseName}`}
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            value={drafts[row.warehouseId] ?? ""}
                            disabled={isPending}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [row.warehouseId]: e.target.value }))
                            }
                            className="w-28 rounded-md border border-default bg-surface px-3 py-2 text-sm"
                          />
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            isDisabled={isPending}
                            onPress={() => submitSave(row)}
                          >
                            Simpan
                          </Button>
                          {row.overrideMinStock !== null ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              isDisabled={isPending}
                              onPress={() => submitRemove(row)}
                            >
                              Hapus / Kembali ke global
                            </Button>
                          ) : null}
                        </div>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <label htmlFor={leadTimeInputId} className="sr-only">
                              Lead time di {row.warehouseName}
                            </label>
                            <input
                              id={leadTimeInputId}
                              aria-label={`Lead time di ${row.warehouseName}`}
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              value={leadTimeDrafts[row.warehouseId] ?? ""}
                              disabled={isPending}
                              onChange={(e) =>
                                setLeadTimeDrafts((d) => ({ ...d, [row.warehouseId]: e.target.value }))
                              }
                              className="w-24 rounded-md border border-default bg-surface px-3 py-2 text-sm"
                            />
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              isDisabled={isPending}
                              onPress={() => submitSaveLeadTime(row)}
                            >
                              Simpan
                            </Button>
                            {row.leadTimeDays != null ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                isDisabled={isPending}
                                onPress={() => submitRemoveLeadTime(row)}
                              >
                                Hapus lead time
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
