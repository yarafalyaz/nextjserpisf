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

// Kontrak final Backend PR #1017 (Q-CD-1): blokir verbatim + npwpConflict.
const blockedMessage =
  "NPWP yang sama sudah tercatat atas nama Budi Santoso (CUST-0007). Pakai pelanggan yang sudah ada itu, atau perbaiki NPWP bila salah ketik."
const blockedResult = {
  success: false as const,
  error: blockedMessage,
  npwpConflict: {
    id: 7,
    slug: "budi-santoso",
    name: "Budi Santoso",
    code: "CUST-0007",
    title: "NPWP sudah dipakai pelanggan lain" as const,
  },
}

const existingCustomer = {
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
}

describe("CustomerForm — blokir NPWP Q-CD-1", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("create diblokir: toast verbatim + panel judul/pesan server + tautan slug pemegang", async () => {
    mockedCreate.mockResolvedValue(blockedResult)
    { const container = document.createElement("div"); document.body.appendChild(container); {
      const root = mountInto(container, <CustomerForm />)
      await submitFilledForm(container)
      expect(mockedError).toHaveBeenCalledWith(blockedMessage)
      expect(mockedSuccess).not.toHaveBeenCalled()
      expect(container.textContent).toContain("NPWP sudah dipakai pelanggan lain")
      expect(container.textContent).toContain(blockedMessage)
      const link = container.querySelector('a[href="/master/pelanggan/budi-santoso"]')
      expect(link).not.toBeNull()
      expect(link!.textContent).toBe("Buka pelanggan existing")
      unmount(root, container)
    } }
  })

  it("update diblokir: panel sama tampil, sukses tidak terucap", async () => {
    mockedUpdate.mockResolvedValue(blockedResult)
    { const container = document.createElement("div"); document.body.appendChild(container); {
      const root = mountInto(container, <CustomerForm customer={existingCustomer} />)
      await submitFilledForm(container)
      expect(mockedError).toHaveBeenCalledWith(blockedMessage)
      expect(mockedSuccess).not.toHaveBeenCalled()
      expect(
        container.querySelector('a[href="/master/pelanggan/budi-santoso"]'),
      ).not.toBeNull()
      unmount(root, container)
    } }
  })

  it("pemegang tanpa slug: tautan jatuh ke id", async () => {
    mockedCreate.mockResolvedValue({
      ...blockedResult,
      npwpConflict: { ...blockedResult.npwpConflict, slug: null },
    })
    { const container = document.createElement("div"); document.body.appendChild(container); {
      const root = mountInto(container, <CustomerForm />)
      await submitFilledForm(container)
      expect(
        container.querySelector('a[href="/master/pelanggan/7"]'),
      ).not.toBeNull()
      unmount(root, container)
    } }
  })

  it("gagal tanpa npwpConflict: toast saja, nol panel blokir", async () => {
    mockedCreate.mockResolvedValue({ success: false, error: "Kode sudah dipakai" })
    { const container = document.createElement("div"); document.body.appendChild(container); {
      const root = mountInto(container, <CustomerForm />)
      await submitFilledForm(container)
      expect(mockedError).toHaveBeenCalledWith("Kode sudah dipakai")
      expect(container.textContent).not.toContain("NPWP sudah dipakai pelanggan lain")
      expect(
        container.querySelector('a[href^="/master/pelanggan/"]'),
      ).toBeNull()
      unmount(root, container)
    } }
  })
})
