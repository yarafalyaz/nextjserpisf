import { referenceHref } from "@/lib/utils/format"

/**
 * Tautan ke entitas yang dicatat `activity logs`.
 *
 * Log mencatat dokumen transaksi DAN data master. Dokumen sudah ditangani
 * `referenceHref` (dipakai mutasi stok/jurnal), jadi di sini ia dipanggil lebih
 * dulu; sisanya dipetakan ke halaman master masing-masing. Tujuannya: baris log
 * bisa diklik alih-alih menampilkan "#16" sebagai teks mati.
 *
 * Rute di bawah hanya yang benar-benar ada di `src/app/(dashboard)` — rute yang
 * tidak ada sengaja tidak dipetakan, karena tautan rusak lebih buruk daripada
 * teks biasa. Halaman-halaman itu me-resolve slug lalu jatuh ke id, sehingga
 * `…/<id>` tetap bekerja.
 */
const MASTER_ROUTES: Record<string, string> = {
  Item: "/master/barang",
  ItemCategory: "/master/kategori-barang",
  Brand: "/master/merek",
  Warehouse: "/master/gudang",
  Customer: "/master/pelanggan",
  Supplier: "/master/vendor",
  Vendor: "/master/vendor",
  Employee: "/master/karyawan",
  Department: "/master/departemen",
  Position: "/master/jabatan",
  Account: "/master/akun",
  Bank: "/master/bank",
  Tax: "/master/pajak",
  TaxGroup: "/master/kelompok-pajak",
  PaymentTerm: "/master/syarat-pembayaran",
  PaymentMethod: "/master/metode-pembayaran",
  ShippingMethod: "/master/metode-pengiriman",
  Unit: "/master/satuan",
  Rack: "/inventaris/rak",
  RackRow: "/inventaris/baris-rak",
  Role: "/pengaturan/peran",
  User: "/pengaturan/pengguna",
  Asset: "/aset",
  Lead: "/crm/leads",
  Ticket: "/crm/tickets",
  Project: "/proyek",
  WorkOrder: "/produksi/perintah-kerja",
  Journal: "/keuangan/jurnal",
  Expense: "/keuangan/pengeluaran",
  PettyCash: "/keuangan/kas-kecil",
  CostCenter: "/keuangan/pusat-biaya",
}

/**
 * Model yang labelnya bisa diresolusi, beserta delegate Prisma dan kolom yang
 * paling menjelaskan bagi pembaca log (nomor dokumen untuk transaksi, kode/nama
 * untuk data master). Datanya murni; query-nya ada di
 * `lib/services/activity-reference.service.ts`.
 */
export const ACTIVITY_REFERENCE_FIELDS: Record<string, { delegate: string; field: string }> = {
  SalesInvoice: { delegate: "salesInvoice", field: "documentNo" },
  SalesOrder: { delegate: "salesOrder", field: "documentNo" },
  SalesReturn: { delegate: "salesReturn", field: "documentNo" },
  SalesPayment: { delegate: "salesPayment", field: "documentNo" },
  Quotation: { delegate: "quotation", field: "documentNo" },
  PurchaseOrder: { delegate: "purchaseOrder", field: "documentNo" },
  PurchaseRequest: { delegate: "purchaseRequest", field: "documentNo" },
  PurchaseReturn: { delegate: "purchaseReturn", field: "documentNo" },
  GoodsReceipt: { delegate: "goodsReceipt", field: "documentNo" },
  VendorBill: { delegate: "vendorBill", field: "documentNo" },
  VendorPayment: { delegate: "vendorPayment", field: "documentNo" },
  ProductionOrder: { delegate: "productionOrder", field: "documentNo" },
  MaterialIssue: { delegate: "materialIssue", field: "documentNo" },
  StockAdjustment: { delegate: "stockAdjustment", field: "documentNo" },
  InventoryTransfer: { delegate: "inventoryTransfer", field: "documentNo" },
  WorkOrder: { delegate: "workOrder", field: "documentNo" },
  Journal: { delegate: "journal", field: "journalNumber" },
  Project: { delegate: "project", field: "name" },
  Asset: { delegate: "asset", field: "name" },
  Item: { delegate: "item", field: "name" },
  ItemCategory: { delegate: "itemCategory", field: "name" },
  Brand: { delegate: "brand", field: "name" },
  Warehouse: { delegate: "warehouse", field: "name" },
  Customer: { delegate: "customer", field: "name" },
  Supplier: { delegate: "vendor", field: "name" },
  Vendor: { delegate: "vendor", field: "name" },
  Employee: { delegate: "employee", field: "name" },
  Department: { delegate: "department", field: "name" },
  Position: { delegate: "position", field: "name" },
  Account: { delegate: "account", field: "name" },
  Bank: { delegate: "bank", field: "name" },
  Tax: { delegate: "tax", field: "name" },
  TaxGroup: { delegate: "taxGroup", field: "name" },
  PaymentTerm: { delegate: "paymentTerm", field: "name" },
  PaymentMethod: { delegate: "paymentMethod", field: "name" },
  ShippingMethod: { delegate: "shippingMethod", field: "name" },
  Unit: { delegate: "unitOfMeasure", field: "name" },
  Rack: { delegate: "rack", field: "code" },
  RackRow: { delegate: "rackRow", field: "code" },
  Role: { delegate: "role", field: "name" },
  User: { delegate: "user", field: "name" },
  Lead: { delegate: "lead", field: "name" },
  Ticket: { delegate: "crmTicket", field: "subject" },
  // Sering muncul di log tapi halamannya belum dipetakan: labelnya tetap
  // diresolusi supaya tidak menampilkan id mentah.
  VehicleBrand: { delegate: "vehicleBrand", field: "name" },
  VehicleModel: { delegate: "vehicleModel", field: "name" },
  VehicleVariant: { delegate: "vehicleVariant", field: "name" },
  AssetBrand: { delegate: "assetBrand", field: "name" },
  AssetCategory: { delegate: "assetCategory", field: "name" },
}

/**
 * Apakah label entitas jenis ini memang bisa diresolusi.
 *
 * Dipakai UI untuk membedakan dua sebab sebuah baris tanpa label:
 * model yang tidak dilacak (memang tak ada halaman/labelnya) versus record yang
 * sudah tidak ada — yang terakhir perlu ditandai agar pembaca log tidak menduga
 * "#16" itu kesalahan tampilan.
 */
export function isTrackedActivityReference(modelType: string | null | undefined): boolean {
  return !!modelType && !!ACTIVITY_REFERENCE_FIELDS[modelType]
}

export function activityEntityHref(
  modelType: string | null | undefined,
  modelId: number | null | undefined,
): string | null {
  const documentHref = referenceHref(modelType, modelId)
  if (documentHref) return documentHref
  if (!modelType || modelId == null || Number.isNaN(Number(modelId))) return null
  const base = MASTER_ROUTES[modelType]
  return base ? `${base}/${Number(modelId)}` : null
}

/**
 * Ganti token `#<id>` di deskripsi log dengan label manusiawi entitasnya
 * (nomor dokumen / kode / nama).
 *
 * Deskripsi log ditulis di puluhan pemanggil `logActivity()` dengan id mentah
 * tertanam, mis. "Membuat faktur penjualan #16". Mengganti di sisi tampilan
 * membuat entri JELAS sekaligus merapikan baris lama yang sudah tersimpan —
 * yang tidak bisa dicapai dengan menyunting pemanggilnya satu per satu.
 */
export function applyReferenceLabel(
  description: string,
  modelId: number | null | undefined,
  label: string | null | undefined,
): string {
  if (modelId == null || !label) return description
  return description.split(`#${modelId}`).join(label)
}
