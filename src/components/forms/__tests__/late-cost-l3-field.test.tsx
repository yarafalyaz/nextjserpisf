// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import * as fs from "node:fs"
import * as path from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import {
  L3_MARKER_UI,
  formatL3TagClient,
  parseL3TagClient,
  upsertL3Tag,
  removeL3Tag,
} from "../late-cost-l3-field"

// Penanda UI menduplikasi frasa server (modul server mengimpor Prisma,
// tidak bisa diimpor komponen client). Tes ini penjaga paritasnya: ubah
// frasa di salah satu sisi tanpa sisi lain = merah.
const serverSource = fs.readFileSync(
  path.resolve(__dirname, "../../../lib/services/late-cost-l3.service.ts"),
  "utf-8",
)

describe("late-cost-l3-field — paritas penanda server", () => {
  it("L3_MARKER_UI persis L3_MARKER server", () => {
    expect(serverSource).toContain(`export const L3_MARKER = "${L3_MARKER_UI}"`)
  })

  it("format client persis format server", () => {
    expect(serverSource).toContain(
      "return `${L3_MARKER} | WO: ${workOrderNo} | Alasan: ${reason}`",
    )
    expect(formatL3TagClient("WO-0007", "Denda keterlambatan supplier")).toBe(
      "BIAYA TELAT NON-JOB L3 | WO: WO-0007 | Alasan: Denda keterlambatan supplier",
    )
  })

  it("parse client membaca frasa format server", () => {
    expect(parseL3TagClient(formatL3TagClient("WO-0007", "Alasan X"))).toEqual({
      workOrderNo: "WO-0007",
      reason: "Alasan X",
    })
    expect(parseL3TagClient("catatan biasa")).toBeNull()
    expect(parseL3TagClient(null)).toBeNull()
  })

  it("upsert menyisipkan di baris pertama dan mengganti baris lama; teks operator utuh", () => {
    expect(upsertL3Tag("catatan operator", "WO-1", "R1")).toBe(
      "BIAYA TELAT NON-JOB L3 | WO: WO-1 | Alasan: R1\ncatatan operator",
    )
    expect(
      upsertL3Tag(
        "BIAYA TELAT NON-JOB L3 | WO: WO-1 | Alasan: R1\ncatatan operator",
        "WO-2",
        "R2",
      ),
    ).toBe("BIAYA TELAT NON-JOB L3 | WO: WO-2 | Alasan: R2\ncatatan operator")
    expect(upsertL3Tag("", "WO-1", "R1")).toBe(
      "BIAYA TELAT NON-JOB L3 | WO: WO-1 | Alasan: R1",
    )
  })

  it("remove menghapus baris penanda saja", () => {
    expect(
      removeL3Tag("BIAYA TELAT NON-JOB L3 | WO: WO-1 | Alasan: R1\ncatatan operator"),
    ).toBe("catatan operator")
    expect(removeL3Tag("catatan operator")).toBe("catatan operator")
  })
})
