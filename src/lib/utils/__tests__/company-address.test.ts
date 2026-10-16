import { describe, expect, it } from "vitest"

import { companyAddressLines, companyAddressOneLine } from "../company-address"

const filled = {
  companyAddress: "Jl. KH Hasyim Ashari No 35",
  companyVillage: "Kenanga",
  companyDistrict: "Cipondoh",
  companyCity: "Kota Tangerang",
  companyProvince: "Banten",
  companyPostalCode: "15146",
}

describe("companyAddressLines", () => {
  it("menyusun baris jalan lalu wilayah dengan kode pos di belakang", () => {
    expect(companyAddressLines(filled)).toEqual([
      "Jl. KH Hasyim Ashari No 35",
      "Kenanga, Cipondoh, Kota Tangerang, Banten 15146",
    ])
  })

  it("merapikan alamat multi-baris dan spasi berlebih", () => {
    expect(
      companyAddressLines({ companyAddress: "Jl. Contoh No 5 \n\n Blok C \n" }),
    ).toEqual(["Jl. Contoh No 5 Blok C"])
  })

  it("tetap benar bila sebagian wilayah kosong", () => {
    expect(
      companyAddressLines({
        companyAddress: "Jl. Contoh No 5",
        companyDistrict: "Cipondoh",
        companyCity: "Kota Tangerang",
        companyPostalCode: "15146",
      }),
    ).toEqual(["Jl. Contoh No 5", "Cipondoh, Kota Tangerang 15146"])
  })

  it("menampilkan wilayah tanpa kode pos maupun jalan", () => {
    expect(companyAddressLines({ companyCity: "Kota Tangerang", companyProvince: "Banten" })).toEqual([
      "Kota Tangerang, Banten",
    ])
  })

  it("mengembalikan daftar kosong bila alamat belum diisi", () => {
    expect(companyAddressLines({})).toEqual([])
    expect(companyAddressLines({ companyAddress: "   ", companyCity: null })).toEqual([])
  })
})

describe("companyAddressOneLine", () => {
  it("menggabungkan jalan dan wilayah dalam satu baris", () => {
    expect(companyAddressOneLine(filled)).toBe(
      "Jl. KH Hasyim Ashari No 35, Kenanga, Cipondoh, Kota Tangerang, Banten 15146",
    )
  })

  it("kosong bila belum ada alamat", () => {
    expect(companyAddressOneLine({})).toBe("")
  })
})
