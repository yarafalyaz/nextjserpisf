import { describe, it, expect } from "vitest"
import {
  listPageHref,
  withListParams,
} from "@/lib/utils/list-href"

describe("withListParams", () => {
  it("meneruskan seluruh param aktif saat satu nilai diubah", () => {
    const href = withListParams(
      "/keuangan/jurnal",
      { cari: "umum", status: "draft", halaman: "3" },
      { status: "posted" },
    )
    expect(href).toBe("/keuangan/jurnal?cari=umum&status=posted&halaman=3")
  })

  it("menghapus param bernilai undefined atau string kosong", () => {
    const href = withListParams(
      "/keuangan/jurnal",
      { cari: "umum", halaman: "3", pageSize: "20" },
      { halaman: undefined, pageSize: "" },
    )
    expect(href).toBe("/keuangan/jurnal?cari=umum")
  })

  it("tanpa param tersisa mengembalikan path polos tanpa tanda tanya", () => {
    expect(withListParams("/master/satuan", { halaman: "2" }, { halaman: undefined })).toBe(
      "/master/satuan",
    )
  })

  it("menerima URLSearchParams (bentuk yang dipakai komponen klien)", () => {
    const params = new URLSearchParams("cari=busi&tipe=masuk&halaman=4")
    expect(withListParams("/keuangan/kas-kecil", params, { halaman: 5 })).toBe(
      "/keuangan/kas-kecil?cari=busi&tipe=masuk&halaman=5",
    )
  })

  it("mengambil nilai pertama bila param berupa array", () => {
    expect(withListParams("/keuangan/pengeluaran", { status: ["paid", "draft"] })).toBe(
      "/keuangan/pengeluaran?status=paid",
    )
  })
})

describe("listPageHref", () => {
  it("halaman berikutnya membawa filter dan pencarian yang aktif", () => {
    const href = listPageHref(
      "/keuangan/pengeluaran",
      { cari: "listrik", status: "lunas", klaim: "1", halaman: "1" },
      2,
    )
    expect(href).toBe(
      "/keuangan/pengeluaran?cari=listrik&status=lunas&klaim=1&halaman=2",
    )
  })

  it("halaman pertama tidak menulis ?halaman= dan tetap membawa filter", () => {
    const href = listPageHref("/keuangan/kas-kecil", { tipe: "masuk", halaman: "3" }, 1)
    expect(href).toBe("/keuangan/kas-kecil?tipe=masuk")
  })

  it("mempertahankan pageSize agar ukuran halaman tidak kembali ke bawaan", () => {
    const href = listPageHref("/master/satuan", { pageSize: "100", halaman: "1" }, 2)
    expect(href).toBe("/master/satuan?pageSize=100&halaman=2")
  })
})
