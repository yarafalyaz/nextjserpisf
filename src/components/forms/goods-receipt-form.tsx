"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createGoodsReceipt,
  updateGoodsReceipt,
} from "@/actions/purchase.actions";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Combobox } from "@/components/ui/combobox";
import { AppDatePicker } from "@/components/ui/date-picker";
import {
  FormCard,
  FormSection,
  FormActions,
} from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { allocateLandedCost } from "@/lib/services/landed-cost.service"
import { formatCurrency } from "@/lib/utils/format"

interface ItemMeta {
  name: string;
  sku: string;
  trackBatch: boolean;
  trackSerial: boolean;
  unitOfMeasure: string;
  uomConversions: Array<{ code: string; factorToBase: number }>;
  defaultWarehouseId?: number | null;
  defaultRackId?: number | null;
  defaultRackRowId?: number | null;
}

interface GRFormProps {
  purchaseOrders: Array<{
    id: number;
    documentNo: string;
    vendor?: { name: string };
    // PO-level landed-cost estimate + header discount, used to preview how much
    // of the freight this receipt will absorb.
    shippingCost?: number;
    serviceFee?: number;
    discount?: number;
    items: Array<{
      id: number;
      itemId: number;
      qty: number;
      unitPrice: number;
      // Net line value (qty×unitPrice − line discount) — the allocation weight.
      total?: number;
      receivedQty?: number;
      item: ItemMeta;
    }>;
  }>;
  warehouses: { id: number; name: string }[];
  racks: Array<{ id: number; warehouseId: number; name: string; code: string }>;
  rackRows: Array<{ id: number; rackId: number; name: string; code: string | null }>;
  receipt?: {
    id: number;
    purchaseOrderId: number;
    warehouseId?: number;
    date: string;
    referenceNumber?: string | null;
    notes?: string | null;
    // Actual landed costs recorded on this receipt (edit-mode hydration).
    shippingCost?: number;
    otherCost?: number;
    adminFee?: number;
    // Items from the existing GR, used to hydrate edit mode. The form
    // previously re-derived rows from the PO on every render of an edit page,
    // so saving an edited GR wiped the original received data. With this
    // shape the form can hydrate from the receipt instead.
    items?: Array<{
      itemId: number;
      qty: number;
      unitCost: number;
      batchNumber: string;
      expiryDate: string;
      serialNumbers: string;
      warehouseId: number | null;
      rackId?: number | null;
      rackRowId?: number | null;
    }>;
  };
  defaultPoId?: number;
}

interface GRItemRow {
  itemId: number;
  qty: number;
  unitCost: number;
  qtyOrdered: number;
  // PO net unit price (line total / ordered qty) — the landed-cost weight basis,
  // mirroring landed-cost.service so the preview matches the posted value.
  poNetUnitPrice: number;
  warehouseId: string;
  rackId: string;
  rackRowId: string;
  uom: string;
  batchNumber: string;
  expiryDate: string;
  serialNumbers: string;
  // metadata
  name: string;
  trackBatch: boolean;
  trackSerial: boolean;
  unitOfMeasure: string;
  uomConversions: Array<{ code: string; factorToBase: number }>;
}

function mapPoToRows(
  po: GRFormProps["purchaseOrders"][number] | undefined,
): GRItemRow[] {
  if (!po) return [];
  return po.items.map((item) => {
    const netTotal =
      item.total != null
        ? Number(item.total)
        : Number(item.qty) * Number(item.unitPrice);
    return {
      itemId: item.itemId,
      qty: Number(item.qty) - Number(item.receivedQty || 0),
      unitCost: Number(item.unitPrice),
      qtyOrdered: Number(item.qty),
      poNetUnitPrice: Number(item.qty) > 0 ? netTotal / Number(item.qty) : 0,
      warehouseId: item.item?.defaultWarehouseId
        ? String(item.item.defaultWarehouseId)
        : "",
      rackId: item.item?.defaultRackId ? String(item.item.defaultRackId) : "",
      rackRowId: item.item?.defaultRackRowId
        ? String(item.item.defaultRackRowId)
        : "",
      uom: item.item?.unitOfMeasure ?? "PCS",
      batchNumber: "",
      expiryDate: "",
      serialNumbers: "",
      name: item.item?.name ?? `Item #${item.itemId}`,
      trackBatch: item.item?.trackBatch ?? false,
      trackSerial: item.item?.trackSerial ?? false,
      unitOfMeasure: item.item?.unitOfMeasure ?? "PCS",
      uomConversions: item.item?.uomConversions ?? [],
    };
  });
}

// Hydrate the GR rows from a previously-saved receipt, falling back to
// item metadata from the PO for fields not stored on the GR line (name,
// trackBatch, etc). Without this, edit mode rebuilds the grid from the PO
// and discards every received qty/unitCost/batch/serial on save.
function mapReceiptToRows(
  receipt: NonNullable<GRFormProps["receipt"]>,
  po: GRFormProps["purchaseOrders"][number] | undefined,
): GRItemRow[] {
  if (!receipt.items || receipt.items.length === 0) {
    return mapPoToRows(po);
  }
  return receipt.items.map((ri) => {
    const poItem = po?.items.find((it) => it.itemId === ri.itemId);
    const netTotal = poItem
      ? poItem.total != null
        ? Number(poItem.total)
        : Number(poItem.qty) * Number(poItem.unitPrice)
      : 0;
    return {
      itemId: ri.itemId,
      qty: ri.qty,
      unitCost: ri.unitCost,
      qtyOrdered: poItem ? Number(poItem.qty) : ri.qty,
      poNetUnitPrice:
        poItem && Number(poItem.qty) > 0 ? netTotal / Number(poItem.qty) : 0,
      warehouseId: ri.warehouseId ? String(ri.warehouseId) : "",
      rackId: ri.rackId ? String(ri.rackId) : "",
      rackRowId: ri.rackRowId ? String(ri.rackRowId) : "",
      uom: poItem?.item?.unitOfMeasure ?? "PCS",
      batchNumber: ri.batchNumber,
      expiryDate: ri.expiryDate,
      serialNumbers: ri.serialNumbers,
      name: poItem?.item?.name ?? `Item #${ri.itemId}`,
      trackBatch: poItem?.item?.trackBatch ?? false,
      trackSerial: poItem?.item?.trackSerial ?? false,
      unitOfMeasure: poItem?.item?.unitOfMeasure ?? "PCS",
      uomConversions: poItem?.item?.uomConversions ?? [],
    };
  });
}

export function GoodsReceiptForm({
  purchaseOrders,
  warehouses,
  racks,
  rackRows,
  defaultPoId,
  receipt,
}: GRFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialPoId = receipt?.purchaseOrderId
    ? String(receipt.purchaseOrderId)
    : defaultPoId
      ? String(defaultPoId)
      : "";
  const [poId, setPoId] = useState(initialPoId);
  const [warehouseId, setWarehouseId] = useState(
    receipt?.warehouseId ? String(receipt.warehouseId) : "",
  );
  const [grItems, setGrItems] = useState<GRItemRow[]>(() => {
    // Edit mode: hydrate from the existing GR's lines (qty/unitCost/batch/
    // serial/per-line warehouse) so saving doesn't wipe received data. Only
    // fall back to PO-derived rows when the receipt has no items recorded.
    if (receipt?.id) {
      const po = purchaseOrders.find((p) => p.id === Number(initialPoId));
      return mapReceiptToRows(receipt, po);
    }
    return mapPoToRows(purchaseOrders.find((p) => p.id === Number(initialPoId)));
  });

  const selectedPO = purchaseOrders.find((po) => po.id === Number(poId));

  function handlePoChange(key: string | null) {
    const newPoId = key ? String(key) : "";
    setPoId(newPoId);
    setGrItems(
      mapPoToRows(purchaseOrders.find((p) => p.id === Number(newPoId))),
    );
  }

  function updateItem(index: number, patch: Partial<GRItemRow>) {
    setGrItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...patch };
      return updated;
    });
  }

  const [notes, setNotes] = useState<string>(receipt?.notes ?? "");
  const [referenceNumber, setReferenceNumber] = useState<string>(
    receipt?.referenceNumber ?? "",
  );
  const [date, setDate] = useState<string>(
    receipt?.date ?? toLocalDateOnly(new Date()),
  );
  // Actual landed costs for this receipt. Empty/0 → derive from the PO estimate.
  const [shippingCost, setShippingCost] = useState<string>(
    receipt?.shippingCost ? String(receipt.shippingCost) : "",
  );
  const [otherCost, setOtherCost] = useState<string>(
    receipt?.otherCost ? String(receipt.otherCost) : "",
  );
  const [adminFee, setAdminFee] = useState<string>(
    receipt?.adminFee ? String(receipt.adminFee) : "",
  );

  // Landed-cost preview. Uses the SAME allocator as the verify hook so the
  // numbers shown here are exactly what will land in the FIFO layer / HPP.
  const landedPreview = React.useMemo(() => {
    const po = selectedPO;
    const lines = grItems.map((row) => {
      const conv = row.uomConversions.find((c) => c.code === row.uom);
      const factor = conv && conv.factorToBase > 0 ? conv.factorToBase : 1;
      return { baseQty: Number(row.qty) * factor, poNetUnitPrice: row.poNetUnitPrice };
    });
    const poNetValue = (po?.items ?? []).reduce(
      (s, it) =>
        s +
        (it.total != null
          ? Number(it.total)
          : Number(it.qty) * Number(it.unitPrice)),
      0,
    );
    const poCostPool =
      Number(po?.shippingCost ?? 0) + Number(po?.serviceFee ?? 0);
    return allocateLandedCost({
      lines,
      poCostPool,
      poNetValue,
      poDiscount: Number(po?.discount ?? 0),
      shippingCost: Number(shippingCost) || 0,
      otherCost: Number(otherCost) || 0,
      adminFee: Number(adminFee) || 0,
    });
  }, [grItems, selectedPO, shippingCost, otherCost, adminFee]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("purchaseOrderId", poId);
        formData.append("warehouseId", warehouseId);
        // Persist the user-visible date, not a fresh `new Date()`. The old
        // code overwrote the existing receipt.date with today on every edit,
        // shifting period-cutoff reporting for the original transaction.
        formData.append("date", date);
        if (referenceNumber) formData.append("referenceNumber", referenceNumber);
        // Notes round-trip — the goodsReceiptSchema accepts `notes` but the
        // form never appended it, so any saved notes were silently dropped.
        if (notes) formData.append("notes", notes);
        // Actual landed costs (blank → 0 → hook derives the PO-estimate share).
        formData.append("shippingCost", String(Number(shippingCost) || 0));
        formData.append("otherCost", String(Number(otherCost) || 0));
        formData.append("adminFee", String(Number(adminFee) || 0));
        const items = grItems.map((item) => {
          const serials = item.serialNumbers
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          return {
            itemId: item.itemId,
            qty: item.qty,
            unitCost: item.unitCost,
            warehouseId: item.warehouseId ? Number(item.warehouseId) : null,
            rackId: item.rackId ? Number(item.rackId) : null,
            rackRowId: item.rackRowId ? Number(item.rackRowId) : null,
            uom: item.uom || item.unitOfMeasure,
            batchNumber:
              item.trackBatch && item.batchNumber.trim()
                ? item.batchNumber.trim()
                : undefined,
            expiryDate:
              item.trackBatch && item.expiryDate ? item.expiryDate : undefined,
            serialNumbers:
              item.trackSerial && serials.length > 0 ? serials : undefined,
          };
        });
        formData.append("items", JSON.stringify(items));
        const result = receipt?.id
          ? await updateGoodsReceipt(receipt.id, formData)
          : await createGoodsReceipt(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(
          receipt?.id
            ? "Data berhasil diperbarui"
            : "Data berhasil ditambahkan",
        );
        router.push("/pembelian/penerimaan");
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
            <Label htmlFor="purchaseOrderId">Pesanan Pembelian *</Label>
            <Combobox
              id="purchaseOrderId"
              options={purchaseOrders.map((po) => ({
                value: String(po.id),
                label: `${po.documentNo} - ${po.vendor?.name ?? ""}`,
              }))}
              value={poId || null}
              onChange={(key) => handlePoChange(key ? String(key) : null)}
              placeholder="Cari pesanan pembelian..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="warehouseId">Gudang Tujuan (Bawaan) *</Label>
            <Combobox
              id="warehouseId"
              options={warehouses.map((w) => ({
                value: String(w.id),
                label: w.name,
              }))}
              value={warehouseId || null}
              onChange={(key) => setWarehouseId(key ? String(key) : "")}
              placeholder="Cari gudang..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="referenceNumber">No. Referensi / DO</Label>
            <input
              id="referenceNumber"
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Mis. DO-2024-001"
              className="form-input"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shippingCost">Ongkir Aktual</Label>
            <input
              id="shippingCost"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)}
              placeholder="Kosongkan untuk pakai estimasi PO"
              className="form-input"
            />
            <p className="text-xs text-muted-foreground">
              Ongkir nyata penerimaan ini. Kosong / 0 = pakai porsi estimasi PO.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otherCost">Biaya Lain</Label>
            <input
              id="otherCost"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={otherCost}
              onChange={(e) => setOtherCost(e.target.value)}
              placeholder="Packing, dll."
              className="form-input"
            />
            <p className="text-xs text-muted-foreground">
              Biaya tambahan lain yang masuk HPP (bukan PPN masukan).
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adminFee">Biaya Admin Bank</Label>
            <input
              id="adminFee"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={adminFee}
              onChange={(e) => setAdminFee(e.target.value)}
              placeholder="Mis. admin transfer BCA"
              className="form-input"
            />
            <p className="text-xs text-muted-foreground">
              Biaya admin/transfer (mis. dari struk Tokopedia/Shopee). Masuk HPP,
              dicatat di akun Beban Admin Bank tersendiri.
            </p>
          </div>
        </FormSection>

        {selectedPO && grItems.length > 0 && (
          <FormSection
            title="Item"
            columns={1}
            description="HPP per unit dihitung dari harga beli + bagian ongkir − bagian diskon. Angka ini yang akan masuk ke layer FIFO saat penerimaan diverifikasi."
          >
            <div className="overflow-x-auto">
              <table
                className="w-full border-collapse min-w-[1200px]"
                style={{ fontSize: "0.8125rem" }}
              >
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Qty Dipesan</th>
                    <th className="text-right">Sisa</th>
                    <th>Satuan</th>
                    <th className="text-right">Harga Beli</th>
                    <th className="text-right">Bagian Ongkir</th>
                    <th className="text-right">Bagian Diskon</th>
                    <th className="text-right">HPP/Unit</th>
                    <th>Gudang (per item)</th>
                    <th>Rak</th>
                    <th>Baris</th>
                  </tr>
                </thead>
                <tbody>
                  {grItems.map((row, index) => {
                    const uomOptions = [
                      row.unitOfMeasure,
                      ...row.uomConversions.map((u) => u.code),
                    ];
                    const hasConversions = row.uomConversions.length > 0;
                    const expiryId = `expiry-${index}`;
                    const batchId = `batch-${index}`;
                    const serialId = `serial-${index}`;
                    // The allocator returns per-ROW rupiah amounts; divide by the
                    // row qty to show per-unit figures in the unit the user typed.
                    const rowQty = Number(row.qty) || 0;
                    const chargePerUnit =
                      rowQty > 0 ? (landedPreview.chargeAdditions[index] ?? 0) / rowQty : 0;
                    const discountPerUnit =
                      rowQty > 0 ? (landedPreview.discountAdditions[index] ?? 0) / rowQty : 0;
                    const hppPerUnit =
                      Number(row.unitCost || 0) + chargePerUnit - discountPerUnit;
                    return (
                      <React.Fragment key={row.itemId}>
                        <tr>
                          <td>{row.name}</td>
                          <td className="text-right">{row.qtyOrdered}</td>
                          <td className="text-right font-medium">
                            {row.qty} {row.uom || row.unitOfMeasure}
                          </td>
                          <td>
                            {hasConversions ? (
                              <Combobox
                                value={row.uom || null}
                                onChange={(key) =>
                                  updateItem(index, { uom: key ?? "" })
                                }
                                options={uomOptions.map((code) => ({
                                  value: code,
                                  label: code,
                                }))}
                                placeholder="Pilih satuan..."
                                className="w-full"
                              />
                            ) : (
                              <span className="text-muted-foreground">
                                {row.unitOfMeasure}
                              </span>
                            )}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatCurrency(Number(row.unitCost || 0))}
                          </td>
                          <td className="text-right tabular-nums text-muted-foreground">
                            {chargePerUnit > 0
                              ? `+ ${formatCurrency(chargePerUnit)}`
                              : "—"}
                          </td>
                          <td className="text-right tabular-nums text-muted-foreground">
                            {discountPerUnit > 0
                              ? `− ${formatCurrency(discountPerUnit)}`
                              : "—"}
                          </td>
                          <td className="text-right tabular-nums font-medium">
                            {formatCurrency(hppPerUnit)}
                          </td>
                          <td>
                            <Combobox
                              value={row.warehouseId || null}
                              onChange={(key) =>
                                updateItem(index, {
                                  warehouseId: key ?? "",
                                  // Warehouse changed → the previously chosen
                                  // rack/row belong to another warehouse. Clear
                                  // them so we never store a mismatched bin.
                                  rackId: "",
                                  rackRowId: "",
                                })
                              }
                              options={warehouses.map((w) => ({
                                value: String(w.id),
                                label: w.name,
                              }))}
                              placeholder="— Bawaan —"
                              className="w-full"
                            />
                          </td>
                          <td>
                            <Combobox
                              value={row.rackId || null}
                              onChange={(key) =>
                                updateItem(index, {
                                  rackId: key ?? "",
                                  // Rack changed → drop the row chosen under the
                                  // previous rack.
                                  rackRowId: "",
                                })
                              }
                              options={racks
                                .filter(
                                  (r) =>
                                    String(r.warehouseId) ===
                                    (row.warehouseId || warehouseId),
                                )
                                .map((r) => ({
                                  value: String(r.id),
                                  label: r.code ? `${r.code} — ${r.name}` : r.name,
                                }))}
                              placeholder="— Rak —"
                              className="w-full"
                              disabled={!(row.warehouseId || warehouseId)}
                            />
                          </td>
                          <td>
                            <Combobox
                              value={row.rackRowId || null}
                              onChange={(key) =>
                                updateItem(index, { rackRowId: key ?? "" })
                              }
                              options={rackRows
                                .filter((rr) => String(rr.rackId) === row.rackId)
                                .map((rr) => ({
                                  value: String(rr.id),
                                  label: rr.code ? `${rr.code} — ${rr.name}` : rr.name,
                                }))}
                              placeholder="— Baris —"
                              className="w-full"
                              disabled={!row.rackId}
                            />
                          </td>
                        </tr>
                        {(row.trackBatch || row.trackSerial) && (
                          <tr>
                            <td colSpan={11} style={{ paddingBottom: "12px" }}>
                              <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3">
                                {row.trackBatch && (
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="flex flex-col gap-1.5">
                                      <Label htmlFor={batchId}>
                                        No. Batch/Lot
                                      </Label>
                                      <input
                                        id={batchId}
                                        type="text"
                                        value={row.batchNumber}
                                        onChange={(e) =>
                                          updateItem(index, {
                                            batchNumber: e.target.value,
                                          })
                                        }
                                        placeholder="Mis. LOT-2024-001"
                                        className="form-input"
                                        style={{
                                          fontSize: "0.8125rem",
                                          padding: "6px",
                                        }}
                                      />
                                    </div>
                                    <AppDatePicker
                                      name={expiryId}
                                      value={row.expiryDate}
                                      onChange={(v) =>
                                        updateItem(index, {
                                          expiryDate: v,
                                        })
                                      }
                                      label="Kedaluwarsa"
                                    />
                                  </div>
                                )}
                                {row.trackSerial && (
                                  <div className="flex flex-col gap-1.5">
                                    <Label htmlFor={serialId}>
                                      Nomor Seri (satu per baris)
                                    </Label>
                                    <textarea
                                      id={serialId}
                                      value={row.serialNumbers}
                                      onChange={(e) =>
                                        updateItem(index, {
                                          serialNumbers: e.target.value,
                                        })
                                      }
                                      rows={3}
                                      placeholder={"SN-0001\nSN-0002"}
                                      className="form-input"
                                      style={{
                                        fontSize: "0.8125rem",
                                        padding: "6px",
                                      }}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                      Jumlah nomor seri harus sama dengan qty (
                                      {row.qty}).
                                    </p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Ongkir Terserap</p>
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {formatCurrency(landedPreview.shippingCost)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Biaya Lain</p>
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {formatCurrency(landedPreview.otherCost)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Admin Bank</p>
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {formatCurrency(landedPreview.adminFee)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Diskon Terserap</p>
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {formatCurrency(landedPreview.discount)}
                </p>
              </div>
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                <p className="text-xs text-muted-foreground">
                  Total Masuk HPP
                </p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(landedPreview.absorbed)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Total masuk HPP = ongkir terserap + biaya lain + admin bank − diskon terserap.
              {!shippingCost && !otherCost && !adminFee
                ? " Ongkir/biaya kosong, jadi dipakai porsi proporsional dari estimasi PO."
                : ""}
            </p>
          </FormSection>
        )}

        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button
            type="submit"
            variant="primary"
            isDisabled={isPending || !poId || !warehouseId}
          >
            {isPending ? "Memproses..." : "Terima Barang"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  );
}
