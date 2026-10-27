"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  createMaterialIssue,
  updateMaterialIssue,
} from "@/actions/inventory.actions";
import { useState } from "react";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Combobox } from "@/components/ui/combobox";
import { QuickAddSelect } from "@/components/ui/quick-add-select";
import { QUICK_ADD } from "@/lib/quick-add/registry";
import { Button } from "@/components/ui/button";
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { nextItemUid } from "@/lib/utils/item-uid"
import {
  SCRAP_REASON_CODES,
  SCRAP_REASON_LABELS,
  validateScrapInput,
} from "@/lib/services/scrap-classification"

interface MaterialIssueFormProps {
  warehouses: { id: number; name: string }[];
  /** WO terpilih awal dari segmen path `perintah-kerja/<slug>` (jalur "buat dari"). */
  defaultWorkOrderId?: number;
  costCenters?: { id: number; code: string; name: string }[];
  /** Pilihan dokumen sumber (perintah kerja) — kolom `workOrderId` sudah ada di skema. */
  workOrders?: { id: number; documentNo: string }[];
  /** Pilihan proyek — kolom `projectId` sudah ada di skema. */
  projects?: { id: number; name: string }[];
  issue?: {
    id: number;
    workOrderId?: number | null;
    projectId?: number | null;
    warehouseId?: number;
    date: string;
    notes?: string | null;
    costCenterId?: number | null;
    items?: Array<{
      itemId: number;
      qty: number;
      scrapQty?: number;
      scrapReasonCode?: string | null;
      scrapNote?: string | null;
    }>;
  };
  items: {
    id: number;
    sku: string;
    name: string;
    qtyOnHand: string;
    cost: string;
  }[];
}

interface MIItem {
  itemId: number;
  qty: number;
  unitCost: number;
  scrapQty: number;
  scrapReasonCode: string;
  scrapNote: string;
  /** Kunci baris untuk React; dibuang sebelum dikirim ke server. */
  uid: string;
}

export interface MaterialIssuePayload {
  warehouseId: string;
  date: string;
  costCenterId?: string | null;
  workOrderId?: string | null;
  projectId?: string | null;
  items: Array<{
    itemId: number;
    qty: number;
    unitCost: number;
    scrapQty?: number;
    scrapReasonCode?: string | null;
    scrapNote?: string | null;
  }>;
}

/**
 * FormData yang dikirim ke server action, dipisah dari `onSubmit` supaya bisa
 * diuji langsung tanpa DOM.
 *
 * Kolom penaut (workOrderId/projectId/costCenterId) hanya dikirim bila terisi.
 * Mengirim string kosong berbahaya: `parseFormData` mengubahnya menjadi
 * `undefined`, dan `updateMaterialIssue` memperlakukan `undefined` sebagai
 * "jangan sentuh" — jadi nilai kosong tidak menghapus apa pun, sedangkan pada
 * create ia memang berarti "tanpa tautan".
 */
export function buildMaterialIssueFormData(input: MaterialIssuePayload): FormData {
  const formData = new FormData();
  formData.append("warehouseId", input.warehouseId);
  formData.append("date", input.date);
  formData.append(
    "items",
    JSON.stringify(
      input.items.map(({ itemId, qty, unitCost, scrapQty, scrapReasonCode, scrapNote }) => ({
        itemId,
        qty,
        unitCost,
        scrapQty: Number(scrapQty ?? 0),
        scrapReasonCode: scrapReasonCode?.trim() ? scrapReasonCode : null,
        scrapNote: scrapNote?.trim() ? scrapNote : null,
      })),
    ),
  );
  const links: Array<[string, string | null | undefined]> = [
    ["costCenterId", input.costCenterId],
    ["workOrderId", input.workOrderId],
    ["projectId", input.projectId],
  ];
  for (const [field, value] of links) {
    if (value) formData.append(field, value);
  }
  return formData;
}

export function MaterialIssueForm({
  warehouses,
  defaultWorkOrderId,
  costCenters = [],
  workOrders = [],
  projects = [],
  items,
  issue,
}: MaterialIssueFormProps) {
  const router = useRouter();
  // Jalur "buat dari": segmen path `perintah-kerja/<slug>` diteruskan server
  // sebagai `defaultWorkOrderId` (pola yang sama dengan form rak/baris rak).
  // Tanpa itu, pengeluaran material dari form Inventaris selalu orphan:
  // `workOrderId` tertinggal null walau kolomnya sudah ada di skema.
  const [isPending, startTransition] = useTransition();
  const [warehouseOptions, setWarehouseOptions] = useState(warehouses);
  const [warehouseId, setWarehouseId] = useState(
    issue?.warehouseId ? String(issue.warehouseId) : "",
  );
  const [costCenterOptions, setCostCenterOptions] = useState(costCenters);
  const [costCenterId, setCostCenterId] = useState(
    issue?.costCenterId ? String(issue.costCenterId) : "",
  );
  const [workOrderId, setWorkOrderId] = useState(
    issue?.workOrderId
      ? String(issue.workOrderId)
      : defaultWorkOrderId
        ? String(defaultWorkOrderId)
        : "",
  );
  const [projectId, setProjectId] = useState(
    issue?.projectId ? String(issue.projectId) : "",
  );
  const [miItems, setMiItems] = useState<MIItem[]>(
    issue?.items && issue.items.length > 0
      ? issue.items.map((it) => ({
          itemId: it.itemId,
          qty: it.qty,
          unitCost: Number(items.find((x) => x.id === it.itemId)?.cost ?? 0),
          scrapQty: Number(it.scrapQty ?? 0),
          scrapReasonCode: it.scrapReasonCode ?? "",
          scrapNote: it.scrapNote ?? "",
          uid: nextItemUid(),
        }))
      : [{ itemId: 0, qty: 1, unitCost: 0, scrapQty: 0, scrapReasonCode: "", scrapNote: "", uid: nextItemUid() }],
  );

  function addItem() {
    setMiItems([...miItems, { itemId: 0, qty: 1, unitCost: 0, scrapQty: 0, scrapReasonCode: "", scrapNote: "", uid: nextItemUid() }]);
  }
  function removeItem(i: number) {
    setMiItems(miItems.filter((_, idx) => idx !== i));
  }
  function updateItem(i: number, field: keyof MIItem, value: string | number) {
    const updated = [...miItems];
    updated[i] = { ...updated[i], [field]: value };
    if (field === "itemId") {
      const item = items.find((it) => it.id === Number(value));
      if (item) updated[i].unitCost = Number(item.cost);
    }
    setMiItems(updated);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    for (const [idx, it] of miItems.entries()) {
      const err = validateScrapInput({
        issueQty: it.qty,
        scrapQty: it.scrapQty,
        scrapReasonCode: it.scrapReasonCode || null,
        scrapNote: it.scrapNote || null,
      });
      if (err) {
        showError(`Baris ${idx + 1}: ${err}`);
        return;
      }
    }
    startTransition(async () => {
      try {
        const formData = buildMaterialIssueFormData({
          warehouseId,
          date: issue?.date ?? toLocalDateOnly(new Date()),
          costCenterId,
          workOrderId,
          projectId,
          items: miItems.map(({ uid: _uid, ...rest }) => rest),
        });
        const result = issue?.id
          ? await updateMaterialIssue(issue.id, formData)
          : await createMaterialIssue(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(
          issue?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan",
        );
        router.push("/inventaris/pengeluaran-material");
        router.refresh();
      } catch (error) {
        showError(
          error instanceof Error ? error.message : "Gagal menyimpan data",
        );
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label={issue?.id ? "Formulir ubah pengeluaran material" : "Formulir tambah pengeluaran material"}
      aria-busy={isPending}
      className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="warehouseId">Gudang <span className="text-destructive" aria-hidden="true">*</span></Label>
          <QuickAddSelect
            id="warehouseId"
            required
            options={warehouseOptions.map((w) => ({
              value: String(w.id),
              label: w.name,
            }))}
            value={warehouseId || null}
            onChange={(key) => setWarehouseId(key ? String(key) : "")}
            placeholder="Cari gudang..."
            title={QUICK_ADD.warehouse.title}
            fields={QUICK_ADD.warehouse.fields}
            action={QUICK_ADD.warehouse.action}
            onCreated={(created) => {
              setWarehouseOptions((prev) => [...prev, { id: created.id, name: created.label }]);
              setWarehouseId(String(created.id));
            }}
          />
        </div>
        {costCenters.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="costCenterId">Pusat Biaya</Label>
          <QuickAddSelect
            id="costCenterId"
            name="costCenterId"
            options={costCenterOptions.map((cc) => ({ value: String(cc.id), label: `${cc.code} — ${cc.name}` }))}
            value={costCenterId || null}
            onChange={(key) => setCostCenterId(key ?? "")}
            placeholder="— Pilih pusat biaya —"
            title={QUICK_ADD.costCenter.title}
            fields={QUICK_ADD.costCenter.fields}
            action={QUICK_ADD.costCenter.action}
            onCreated={(created) => {
              setCostCenterOptions((prev) => [...prev, { id: created.id, code: "", name: created.label }]);
              setCostCenterId(String(created.id));
            }}
          />
        </div>
        )}
        {(workOrders.length > 0 || workOrderId) && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workOrderId">Perintah Kerja</Label>
          {workOrders.length > 0 ? (
            <Combobox
              id="workOrderId"
              name="workOrderId"
              options={workOrders.map((wo) => ({ value: String(wo.id), label: wo.documentNo }))}
              value={workOrderId || null}
              onChange={(key) => setWorkOrderId(key ?? "")}
              placeholder="— Tanpa perintah kerja —"
            />
          ) : (
            <>
              {/* Halaman pemanggil belum mengirim daftar perintah kerja; tautan
                  yang sudah menempel (dari segmen perintah-kerja/<slug> atau
                  dokumen yang diubah) tetap harus ikut tersimpan apa adanya. */}
              <input type="hidden" name="workOrderId" value={workOrderId} />
              <p className="text-sm text-foreground">Perintah Kerja #{workOrderId}</p>
            </>
          )}
        </div>
        )}
        {(projects.length > 0 || projectId) && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="projectId">Proyek</Label>
          {projects.length > 0 ? (
            <Combobox
              id="projectId"
              name="projectId"
              options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
              value={projectId || null}
              onChange={(key) => setProjectId(key ?? "")}
              placeholder="— Tanpa proyek —"
            />
          ) : (
            <>
              <input type="hidden" name="projectId" value={projectId} />
              <p className="text-sm text-foreground">Proyek #{projectId}</p>
            </>
          )}
        </div>
        )}
      </div>

      <div style={{ marginTop: "24px" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Material</h3>
          <Button type="button" onPress={addItem} variant="secondary" size="sm">
            + Tambah
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse min-w-[900px]"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                <th>Item</th>
                <th>Jumlah</th>
                <th>Qty Scrap</th>
                <th>Alasan Scrap</th>
                <th>Catatan Scrap</th>
                <th>Harga Satuan</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {miItems.map((item, i) => (
                <tr key={item.uid}>
                  <td>
                    <Combobox
                      options={items.map((it) => ({
                        value: String(it.id),
                        label: `${it.sku} - ${it.name}`,
                      }))}
                      value={item.itemId ? String(item.itemId) : null}
                      onChange={(key) =>
                        updateItem(i, "itemId", key ? Number(key) : 0)
                      }
                      placeholder="Cari item..."
                      className="w-full"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={(e) =>
                        updateItem(i, "qty", Number(e.target.value))
                      }
                      aria-label={`Jumlah baris ${i + 1}`}
                      className="form-input"
                      style={{
                        fontSize: "0.8125rem",
                        padding: "6px",
                        width: "80px",
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.scrapQty}
                      onChange={(e) =>
                        updateItem(i, "scrapQty", Number(e.target.value))
                      }
                      aria-label={`Qty scrap baris ${i + 1}`}
                      className="form-input"
                      style={{
                        fontSize: "0.8125rem",
                        padding: "6px",
                        width: "80px",
                      }}
                    />
                  </td>
                  <td>
                    <select
                      value={item.scrapReasonCode}
                      onChange={(e) =>
                        updateItem(i, "scrapReasonCode", e.target.value)
                      }
                      aria-label={`Alasan scrap baris ${i + 1}`}
                      className="form-input"
                      style={{ fontSize: "0.8125rem", padding: "6px", width: "150px" }}
                    >
                      <option value="">— Tanpa scrap —</option>
                      {SCRAP_REASON_CODES.map((code) => (
                        <option key={code} value={code}>
                          {SCRAP_REASON_LABELS[code]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={item.scrapNote}
                      onChange={(e) =>
                        updateItem(i, "scrapNote", e.target.value)
                      }
                      aria-label={`Catatan scrap baris ${i + 1}`}
                      placeholder={item.scrapReasonCode === "lainnya" ? "Wajib diisi" : "Opsional"}
                      className="form-input"
                      style={{ fontSize: "0.8125rem", padding: "6px", width: "140px" }}
                    />
                  </td>
                  <td className="text-right">
                    Rp {item.unitCost.toLocaleString("id-ID")}
                  </td>
                  <td className="text-right">
                    Rp {(item.qty * item.unitCost).toLocaleString("id-ID")}
                  </td>
                  <td>
                    {miItems.length > 1 && (
                      <Button
                        type="button"
                        onPress={() => removeItem(i)}
                        variant="danger-soft"
                        size="sm"
                        aria-label={`Hapus baris ${i + 1}`}
                      >
                        ×
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} className="w-full sm:w-auto">
          Batal
        </Button>
        <Button type="submit" isDisabled={isPending} className="w-full sm:w-auto">
          {isPending ? "Memproses..." : "Buat Pengeluaran Material"}
        </Button>
      </div>
    </form>
  );
}
