import {
  createAccount,
  createBank,
  createBrand,
  createCustomer,
  createCustomerCategory,
  createDepartment,
  createEmployee,
  createItemCategory,
  createPaymentTerm,
  createPosition,
  createTax,
  createUom,
  createVendor,
  createWarehouse,
} from "@/actions/master.actions"
import { createPaymentMethod, createShippingMethod } from "@/actions/method.actions"
import { createCostCenter } from "@/actions/finance.actions"
import type { QuickAddAction, QuickAddField } from "@/components/ui/quick-add-select"

const ACCOUNT_TYPE_OPTIONS = [
  { value: "ASSET", label: "Aset" },
  { value: "LIABILITY", label: "Liabilitas" },
  { value: "EQUITY", label: "Ekuitas" },
  { value: "REVENUE", label: "Pendapatan" },
  { value: "EXPENSE", label: "Beban" },
]

const NORMAL_BALANCE_OPTIONS = [
  { value: "DEBIT", label: "Debit" },
  { value: "CREDIT", label: "Kredit" },
]

/**
 * Declarative quick-add definitions, one per master entity that appears in a
 * select box. Each entry names the server action and the minimal set of fields
 * needed to create a valid row. Keeping them here (rather than inline in each
 * caller) means the dialog markup lives once and the entity list is easy to
 * audit or extend.
 */
export interface QuickAddDefinition {
  /** Human title, also used in the dialog header and toast. */
  title: string
  /** Server action that persists the record and returns `{ id }`. */
  action: QuickAddAction
  /** Fields shown in the dialog, in order. */
  fields: QuickAddField[]
  /** Optional custom label (defaults to the `name` field). */
  getLabel?: (formData: FormData) => string
}

export const QUICK_ADD = {
  customerCategory: {
    title: "Kategori Pelanggan",
    action: createCustomerCategory,
    fields: [
      { name: "name", label: "Nama Kategori", required: true, placeholder: "mis. DP 20%" },
      {
        name: "downPaymentPercent",
        label: "Persentase Uang Muka (DP) (%)",
        type: "number",
        required: true,
        step: "0.01",
        min: "0",
        max: "100",
        defaultValue: 0,
      },
    ],
  },

  itemCategory: {
    title: "Kategori Barang",
    action: createItemCategory,
    fields: [
      { name: "name", label: "Nama Kategori", required: true, placeholder: "Nama kategori" },
      { name: "description", label: "Deskripsi", type: "textarea", placeholder: "Opsional" },
    ],
  },

  uom: {
    title: "Satuan",
    action: createUom,
    fields: [
      { name: "name", label: "Nama Satuan", required: true, placeholder: "mis. Piece" },
      { name: "symbol", label: "Simbol", required: true, placeholder: "mis. PCS" },
    ],
  },

  warehouse: {
    title: "Gudang",
    action: createWarehouse,
    fields: [
      { name: "name", label: "Nama Gudang", required: true, placeholder: "Nama gudang" },
      { name: "code", label: "Kode", placeholder: "Otomatis bila kosong" },
      { name: "address", label: "Alamat", type: "textarea", placeholder: "Opsional" },
    ],
  },

  vendor: {
    title: "Vendor",
    action: createVendor,
    fields: [
      { name: "name", label: "Nama Vendor", required: true, placeholder: "Nama vendor" },
      { name: "code", label: "Kode", placeholder: "Otomatis bila kosong" },
      { name: "phone", label: "Telepon", placeholder: "Opsional" },
      { name: "email", label: "Email", type: "email", placeholder: "Opsional" },
    ],
  },

  department: {
    title: "Departemen",
    action: createDepartment,
    fields: [
      { name: "name", label: "Nama Departemen", required: true, placeholder: "Nama departemen" },
      { name: "code", label: "Kode", placeholder: "Otomatis bila kosong" },
    ],
  },

  position: {
    title: "Jabatan",
    action: createPosition,
    fields: [
      { name: "name", label: "Nama Jabatan", required: true, placeholder: "Nama jabatan" },
      { name: "code", label: "Kode", placeholder: "Otomatis bila kosong" },
    ],
  },

  bank: {
    title: "Bank",
    action: createBank,
    fields: [
      { name: "name", label: "Nama Bank", required: true, placeholder: "mis. Bank BCA" },
      { name: "code", label: "Kode Bank", required: true, placeholder: "mis. BCA" },
      {
        name: "type",
        label: "Tipe",
        type: "select",
        required: true,
        defaultValue: "bank",
        options: [
          { value: "bank", label: "Bank" },
          { value: "cash", label: "Kas" },
        ],
      },
    ],
  },

  paymentTerm: {
    title: "Syarat Pembayaran",
    action: createPaymentTerm,
    fields: [
      { name: "name", label: "Nama", required: true, placeholder: "mis. NET 30" },
      { name: "code", label: "Kode", required: true, placeholder: "mis. NET30" },
      { name: "days", label: "Hari", type: "number", min: "0", defaultValue: 30 },
    ],
  },

  paymentMethod: {
    title: "Metode Pembayaran",
    action: createPaymentMethod,
    fields: [
      { name: "name", label: "Nama", required: true, placeholder: "mis. Transfer Bank" },
      { name: "code", label: "Kode", placeholder: "Otomatis bila kosong" },
    ],
  },

  shippingMethod: {
    title: "Metode Pengiriman",
    action: createShippingMethod,
    fields: [
      { name: "name", label: "Nama", required: true, placeholder: "mis. JNE Reguler" },
      { name: "code", label: "Kode", placeholder: "Otomatis bila kosong" },
    ],
  },

  tax: {
    title: "Pajak",
    action: createTax,
    fields: [
      { name: "name", label: "Nama Pajak", required: true, placeholder: "mis. PPN" },
      {
        name: "rate",
        label: "Rate (%)",
        type: "number",
        required: true,
        step: "0.01",
        min: "0",
        defaultValue: 11,
      },
      { name: "code", label: "Kode", placeholder: "mis. PPN11" },
    ],
  },

  costCenter: {
    title: "Pusat Biaya",
    action: createCostCenter,
    fields: [
      { name: "name", label: "Nama", required: true, placeholder: "Nama pusat biaya" },
      { name: "code", label: "Kode", required: true, placeholder: "mis. CC-01" },
      { name: "description", label: "Deskripsi", type: "textarea", placeholder: "Opsional" },
    ],
  },

  brand: {
    title: "Merek",
    action: createBrand,
    fields: [
      { name: "name", label: "Nama Merek", required: true, placeholder: "Nama merek" },
      { name: "description", label: "Deskripsi", type: "textarea", placeholder: "Opsional" },
    ],
  },

  customer: {
    title: "Pelanggan",
    action: createCustomer,
    fields: [
      { name: "name", label: "Nama Pelanggan", required: true, placeholder: "Nama pelanggan" },
      { name: "phone", label: "Telepon", placeholder: "Opsional" },
      { name: "email", label: "Email", type: "email", placeholder: "Opsional" },
    ],
  },

  employee: {
    title: "Karyawan",
    action: createEmployee,
    fields: [
      { name: "name", label: "Nama Karyawan", required: true, placeholder: "Nama karyawan" },
      { name: "joinDate", label: "Tanggal Masuk", type: "date", required: true },
      { name: "phone", label: "Telepon", placeholder: "Opsional" },
    ],
  },

  account: {
    title: "Akun",
    action: createAccount,
    fields: [
      { name: "name", label: "Nama Akun", required: true, placeholder: "Nama akun" },
      { name: "code", label: "Kode", placeholder: "Otomatis bila kosong" },
      {
        name: "type",
        label: "Tipe",
        type: "select",
        required: true,
        defaultValue: "ASSET",
        options: ACCOUNT_TYPE_OPTIONS,
      },
      {
        name: "normalBalance",
        label: "Saldo Normal",
        type: "select",
        required: true,
        defaultValue: "DEBIT",
        options: NORMAL_BALANCE_OPTIONS,
      },
    ],
  },
} satisfies Record<string, QuickAddDefinition>

export type QuickAddKey = keyof typeof QUICK_ADD
