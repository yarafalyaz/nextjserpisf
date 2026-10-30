import { describe, expect, it } from "vitest"

import { notificationBodyHref } from "../body-href"

describe("notificationBodyHref (R6WN-10)", () => {
  it("path route tunggal menjadi href", () => {
    expect(notificationBodyHref("/penjualan/penawaran/5")).toBe("/penjualan/penawaran/5")
    expect(notificationBodyHref("/pengaturan/persetujuan/ap-1")).toBe("/pengaturan/persetujuan/ap-1")
  })

  it("teks dengan path di dalamnya tetap teks, bukan link", () => {
    expect(notificationBodyHref("Buka /penjualan/penawaran/5 sekarang")).toBeNull()
    expect(notificationBodyHref("/penjualan/penawaran/5 sudah dibayar")).toBeNull()
    expect(notificationBodyHref("Stok Oli Menipis")).toBeNull()
    expect(notificationBodyHref("")).toBeNull()
  })

  it("menolak path berisiko (protokol relatif, query, spasi)", () => {
    expect(notificationBodyHref("//evil.example.com/x")).toBeNull()
    expect(notificationBodyHref("/pencarian?q=1")).toBeNull()
    expect(notificationBodyHref("/path with space")).toBeNull()
  })
})
