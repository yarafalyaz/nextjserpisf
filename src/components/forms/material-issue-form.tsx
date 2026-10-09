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

interface MaterialIssueFormProps {
  warehouses: { id: number; name: string }[];
  costCenters?: { id: number; code: string; name: string }[];
  issue?: {
    id: number;
    workOrderId: number;
    warehouseId?: number;
    date: string;
    notes?: string | null;
    costCenterId?: number | null;
    items?: Array<{ itemId: number; qty: number }>;
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
}

export function MaterialIssueForm({
  warehouses,
  costCenters = [],
  items,
  issue,
}: MaterialIssueFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [warehouseOptions, setWarehouseOptions] = useState(warehouses);
  const [warehouseId, setWarehouseId] = useState(
    issue?.warehouseId ? String(issue.warehouseId) : "",
  );
  const [costCenterOptions, setCostCenterOptions] = useState(costCenters);
  const [costCenterId, setCostCenterId] = useState(
    issue?.costCenterId ? String(issue.costCenterId) : "",
  );
  const [miItems, setMiItems] = useState<MIItem[]>(
    issue?.items && issue.items.length > 0
      ? issue.items.map((it) => ({
          itemId: it.itemId,
          qty: it.qty,
          unitCost: Number(items.find((x) => x.id === it.itemId)?.cost ?? 0),
        }))
      : [{ itemId: 0, qty: 1, unitCost: 0 }],
  );

  function addItem() {
    setMiItems([...miItems, { itemId: 0, qty: 1, unitCost: 0 }]);
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
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("warehouseId", warehouseId);
        formData.append("date", toLocalDateOnly(new Date()));
        formData.append("items", JSON.stringify(miItems));
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
      className="bg-surface rounded-xl border border-default shadow-sm p-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="warehouseId">Gudang *</Label>
          <QuickAddSelect
            id="warehouseId"
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
      </div>

      <div style={{ marginTop: "24px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Material</h3>
          <Button type="button" onPress={addItem} variant="secondary" size="sm">
            + Tambah
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse min-w-[640px]"
            style={{ fontSize: "0.8125rem" }}
          >
            <thead>
              <tr>
                <th>Item</th>
                <th>Jumlah</th>
                <th>Harga Satuan</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {miItems.map((item, i) => (
                <tr key={i}>
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

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()}>
          Batal
        </Button>
        <Button type="submit" isDisabled={isPending}>
          {isPending ? "Memproses..." : "Buat Pengeluaran Material"}
        </Button>
      </div>
    </form>
  );
}
