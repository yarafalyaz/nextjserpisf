// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { CustomerForm } from "../customer-form"
import { showSuccess, showError } from "@/lib/utils/toast"
import { createCustomer, updateCustomer } from "@/actions/master.actions"
import {
  mountInto,
  unmount,
  submitFilledForm,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/master.actions", () => ({
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}))
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)

const mockedCreate = vi.mocked(createCustomer)
const mockedUpdate = vi.mocked(updateCustomer)
const mockedSuccess = vi.mocked(showSuccess)
const mockedError = vi.mocked(showError)

const warning = {
  title: "Kemungkinan pelanggan ganda" as const,
  body: "Data ini cocok dengan pelanggan yang sudah ada. Periksa dulu — pelanggan ganda membagi penawaran, faktur, kendaraan, dan piutang ke dua master." as const,
  candidates: [
    {
      id: 7,
      slug: "budi-santoso",
      name: "Budi Santoso",
      code: "CUST-0007",
      phone: "0812000111",
      email: null,
      taxId: null,
      matchKind: "phone" as const,
      matchLabel: "Nomor telepon sama",
    },
  ],
}

describe("CustomerForm — duplikat F-2026-10-25-003-S", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sukses + duplicateWarning: panel verbatim tampil, sukses generik tetap", async () => {
    mockedCreate.mockResolvedValue({
      success: true,
      id: 10,
      slug: "budi-baru",
      duplicateWarning: warning,
    })
    { const container = document.createElement("div"); document.body.appendChild(container); {
      const root = mountInto(container, <CustomerForm />)
      await submitFilledForm(container)
      expect(mockedSuccess).toHaveBeenCalledWith("Data berhasil ditambahkan")
      expect(container.textContent).toContain("Kemungkinan pelanggan ganda")
      expect(container.textContent).toContain("Budi Santoso")
      expect(container.textContent).toContain("Nomor telepon sama")
      expect(
        container.querySelector('a[href="/master/pelanggan/budi-santoso"]'),
      ).not.toBeNull()
      unmount(root, container)
    } }
  })

  it("sukses tanpa warning: nol panel", async () => {
    mockedCreate.mockResolvedValue({
      success: true,
      id: 10,
      slug: "budi-baru",
      duplicateWarning: null,
    })
    { const container = document.createElement("div"); document.body.appendChild(container); {
      const root = mountInto(container, <CustomerForm />)
      await submitFilledForm(container)
      expect(mockedSuccess).toHaveBeenCalledWith("Data berhasil ditambahkan")
      expect(container.textContent).not.toContain("Kemungkinan pelanggan ganda")
      unmount(root, container)
    } }
  })

  it("quick-add reuse: pesan server verbatim, bukan generik (BR-CD-05)", async () => {
    mockedCreate.mockResolvedValue({
      success: true,
      id: 7,
      slug: "budi-santoso",
      reused: true,
      reusedCustomer: { id: 7, name: "Budi Santoso", code: "CUST-0007", slug: "budi-santoso" },
      message: "Pelanggan sudah ada — data lama dipakai kembali, tidak dibuat ganda.",
    })
    { const container = document.createElement("div"); document.body.appendChild(container); {
      const root = mountInto(container, <CustomerForm />)
      await submitFilledForm(container)
      expect(mockedSuccess).toHaveBeenCalledWith(
        "Pelanggan sudah ada — data lama dipakai kembali, tidak dibuat ganda.",
      )
      expect(mockedSuccess).not.toHaveBeenCalledWith("Data berhasil ditambahkan")
      unmount(root, container)
    } }
  })

  it("mode ubah sukses + warning: panel tampil", async () => {
    mockedUpdate.mockResolvedValue({ success: true, duplicateWarning: warning })
    { const container = document.createElement("div"); document.body.appendChild(container); {
      const root = mountInto(
        container,
        <CustomerForm
          customer={{
            id: 3,
            name: "Budi Lama",
            email: null,
            phone: "0812",
            address: null,
            city: null,
            province: null,
            district: null,
            village: null,
            postalCode: null,
            contactPerson: null,
            gender: null,
            code: "CUST-0003",
          }}
        />,
      )
      await submitFilledForm(container)
      expect(mockedSuccess).toHaveBeenCalledWith("Data berhasil diperbarui")
      expect(container.textContent).toContain("Kemungkinan pelanggan ganda")
      unmount(root, container)
    } }
  })

  it("gagal: error server verbatim, nol panel", async () => {
    mockedCreate.mockResolvedValue({ success: false, error: "Kode sudah dipakai" })
    { const container = document.createElement("div"); document.body.appendChild(container); {
      const root = mountInto(container, <CustomerForm />)
      await submitFilledForm(container)
      expect(mockedError).toHaveBeenCalledWith("Kode sudah dipakai")
      expect(container.textContent).not.toContain("Kemungkinan pelanggan ganda")
      unmount(root, container)
    } }
  })
})
