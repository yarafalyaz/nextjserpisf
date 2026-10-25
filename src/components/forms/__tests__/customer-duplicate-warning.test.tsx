// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import {
  CustomerDuplicateWarningPanel,
  type CustomerDuplicateWarningView,
} from "../customer-duplicate-warning"
import { mountInto, unmount, withContainer } from "./form-a11y-test-utils"

// AC-CD-F1 (F-2026-10-25-003-S): panel menampilkan respons server apa
// adanya — title/body/matchLabel verbatim, nama/kode/kontak kandidat,
// tautan detail existing via slug. Nol hitung kemiripan di UI.
const warning: CustomerDuplicateWarningView = {
  title: "Kemungkinan pelanggan ganda",
  body: "Data ini cocok dengan pelanggan yang sudah ada. Periksa dulu — pelanggan ganda membagi penawaran, faktur, kendaraan, dan piutang ke dua master.",
  candidates: [
    {
      id: 7,
      slug: "budi-santoso",
      name: "Budi Santoso",
      code: "CUST-0007",
      phone: "0812000111",
      email: "budi@maju.id",
      taxId: "01.234.567.8-901.000",
      matchKind: "npwp",
      matchLabel: "NPWP sama",
    },
    {
      id: 8,
      slug: null,
      name: "Andi Wijaya",
      code: null,
      phone: null,
      email: null,
      taxId: null,
      matchKind: "phone",
      matchLabel: "Nomor telepon sama",
    },
  ],
}

describe("CustomerDuplicateWarningPanel — AC-CD-F1", () => {
  it("title/body/matchLabel verbatim + kandidat + tautan slug/id", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <CustomerDuplicateWarningPanel warning={warning} onContinue={() => {}} />,
      )
      expect(container.textContent).toContain("Kemungkinan pelanggan ganda")
      expect(container.textContent).toContain(
        "pelanggan ganda membagi penawaran, faktur, kendaraan, dan piutang",
      )
      expect(container.textContent).toContain("Budi Santoso")
      expect(container.textContent).toContain("CUST-0007")
      expect(container.textContent).toContain("NPWP sama")
      expect(container.textContent).toContain("Nomor telepon sama")
      expect(container.textContent).toContain("Telepon: 0812000111")
      expect(container.textContent).toContain("NPWP: 01.234.567.8-901.000")
      const links = Array.from(container.querySelectorAll("a")).map((a) =>
        a.getAttribute("href"),
      )
      // slug dipakai bila ada; tanpa slug jatuh ke id (entityHref).
      expect(links).toContain("/master/pelanggan/budi-santoso")
      expect(links).toContain("/master/pelanggan/8")
      unmount(root, container)
    })
  })

  it("tombol lanjut memanggil onContinue", () => {
    const onContinue = vi.fn()
    withContainer((container) => {
      const root = mountInto(
        container,
        <CustomerDuplicateWarningPanel warning={warning} onContinue={onContinue} />,
      )
      const button = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Lanjut ke Daftar Pelanggan",
      )!
      button.click()
      expect(onContinue).toHaveBeenCalledTimes(1)
      unmount(root, container)
    })
  })
})
