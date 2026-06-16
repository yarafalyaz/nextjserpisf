"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createStockAdjustment,
  updateStockAdjustment,
} from "@/actions/inventory.actions";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Combobox } from "@/components/ui/combobox";
import {
  FormCard,
  FormSection,
  FormActions,
} from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";

interface AdjustmentFormProps {
  warehouses: { id: number; name: string }[];
  adjustment?: {
    id: number;
    warehouseId: number;
    date: string;
    type?: string;
    reason?: string | null;
    notes?: string | null;
    items?: Array<{
      itemId: number;
      currentQty: number;
      newQty: number;
      unitCost: number;
      reason: string;
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

interface AdjItem {
  itemId: number;
  currentQty: number;
  newQty: number;
  unitCost: number;
  reason: string;
}

export function StockAdjustmentForm({
  warehouses,
  items,
  adjustment,
}: AdjustmentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [warehouseId, setWarehouseId] = useState(
    adjustment?.warehouseId ? String(adjustment.warehouseId) : "",
  );
  const [type, setType] = useState(adjustment?.type ?? "increase");
  const [adjItems, setAdjItems] = useState<AdjItem[]>(
    adjustment?.items && adjustment.items.length > 0
      ? adjustment.items.map((it) => ({
          itemId: it.itemId,
          currentQty: it.currentQty,
          newQty: it.newQty,
          unitCost: it.unitCost,
          reason: it.reason ?? "",
        }))
      : [{ itemId: 0, currentQty: 0, newQty: 0, unitCost: 0, reason: "" }],
  );

  function addItem() {
    setAdjItems([
      ...adjItems,
      { itemId: 0, currentQty: 0, newQty: 0, unitCost: 0, reason: "" },
    ]);
  }

  function removeItem(index: number) {
    setAdjItems(adjItems.filter((_, i) => i !== index));
  }

  function updateItem(
    index: number,
    field: keyof AdjItem,
    value: string | number,
  ) {
    const updated = [...adjItems];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "itemId") {
      const item = items.find((i) => i.id === Number(value));
      if (item) {
        updated[index].currentQty = Number(item.qtyOnHand);
        updated[index].unitCost = Number(item.cost);
      }
    }
    setAdjItems(updated);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("warehouseId", warehouseId);
        formData.append("date", new Date().toISOString().split("T")[0]);
        formData.append("items", JSON.stringify(adjItems));
        formData.append("type", type);
        const notesValue =
          (
            e.currentTarget.querySelector(
              '[name="notes"]',
            ) as HTMLTextAreaElement
          )?.value || "";
        formData.append("notes", notesValue);
        const result = adjustment?.id
          ? await updateStockAdjustment(adjustment.id, formData)
          : await createStockAdjustment(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(
          adjustment?.id
            ? "Data berhasil diperbarui"
            : "Data berhasil ditambahkan",
        );
        router.push("/inventaris/penyesuaian");
        router.refresh();
      } catch (error) {
        showError(
          error instanceof Error ? error.message : "Gagal menyimpan data",
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="warehouseId">Gudang *</Label>
            <Combobox
              id="warehouseId"
              value={warehouseId || null}
              onChange={(key) => setWarehouseId(key ?? "")}
              placeholder="Cari gudang..."
              options={warehouses.map((w) => ({
                value: String(w.id),
                label: w.name,
              }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tipe *</Label>
            <Combobox
              name="type"
              value={type}
              onChange={(key) => setType(key ?? "")}
              placeholder="Cari tipe..."
              className="w-full"
              options={[
                { value: "increase", label: "Penambahan" },
                { value: "decrease", label: "Pengurangan" },
                { value: "recount", label: "Hitung Ulang" },
                { value: "correction", label: "Koreksi" },
              ]}
            />
          </div>
        </FormSection>

        <FormSection title="Catatan" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stock-adjustment-notes">Catatan</Label>
            <Textarea
              id="stock-adjustment-notes"
              name="notes"
              placeholder="Catatan tambahan (opsional)"
              defaultValue={adjustment?.notes || ""}
            />
          </div>
        </FormSection>

        <FormSection title="Item" columns={1}>
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-semibold text-foreground">
                Barang
              </h3>
              <Button
                type="button"
                onPress={addItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-all"
              >
                + Tambah Item
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-default">
                    <th
                      className="text-left py-2 px-2 font-medium text-secondary"
                      style={{ minWidth: "200px" }}
                    >
                      Item
                    </th>
                    <th
                      className="text-left py-2 px-2 font-medium text-secondary"
                      style={{ width: "100px" }}
                    >
                      Stok Saat Ini
                    </th>
                    <th
                      className="text-left py-2 px-2 font-medium text-secondary"
                      style={{ width: "100px" }}
                    >
                      Stok Baru
                    </th>
                    <th
                      className="text-left py-2 px-2 font-medium text-secondary"
                      style={{ width: "80px" }}
                    >
                      Selisih
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-secondary">
                      Alasan
                    </th>
                    <th style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {adjItems.map((item, i) => (
                    <tr key={i} className="border-b border-default/50">
                      <td className="py-2 px-2">
                        <Combobox
                          value={item.itemId ? String(item.itemId) : null}
                          onChange={(key) => updateItem(i, "itemId", key ?? "")}
                          placeholder="Pilih Item"
                          className="w-full"
                          options={items.map((it) => ({
                            value: String(it.id),
                            label: `${it.sku} - ${it.name}`,
                          }))}
                        />
                      </td>
                      <td className="py-2 px-2 text-right">
                        {item.currentQty}
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          value={item.newQty}
                          onChange={(e) =>
                            updateItem(i, "newQty", Number(e.target.value))
                          }
                          className="form-input"
                          style={{
                            fontSize: "0.8125rem",
                            padding: "6px",
                            width: "80px",
                          }}
                        />
                      </td>
                      <td
                        className={`py-2 px-2 text-right ${item.newQty - item.currentQty > 0 ? "text-success" : item.newQty - item.currentQty < 0 ? "text-danger" : ""}`}
                      >
                        {item.newQty - item.currentQty > 0 ? "+" : ""}
                        {item.newQty - item.currentQty}
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={item.reason}
                          onChange={(e) =>
                            updateItem(i, "reason", e.target.value)
                          }
                          className="form-input"
                          style={{ fontSize: "0.8125rem", padding: "6px" }}
                          placeholder="Alasan"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        {adjItems.length > 1 && (
                          <Button
                            type="button"
                            onPress={() => removeItem(i)}
                            className="p-1.5 rounded-md text-danger hover:bg-danger/10 transition-all"
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
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending
              ? "Menyimpan..."
              : adjustment?.id
                ? "Perbarui"
                : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  );
}
