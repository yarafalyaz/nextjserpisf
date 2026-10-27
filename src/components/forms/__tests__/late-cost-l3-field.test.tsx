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

// S8786: regex lama /^BIAYA TELAT NON-JOB L3\s*\|\s*WO:\s*(\S+)\s*\|\s*Alasan:\s*(.*)$/m
// diganti parser manual per baris (pola sama dengan parseL3Tag server).
// Tabel ini merumuskan ulang perilaku regex lama sebagai ekspektasi
// eksplisit; regex lama tidak dipertahankan di kode maupun tes.
describe("late-cost-l3-field — ekuivalensi S8786 parser manual", () => {
  it.each<[string, string | null | undefined, unknown]>([
    ["kosong", "", null],
    ["null", null, null],
    ["undefined", undefined, null],
    ["bukan penanda", "catatan biasa", null],
    [
      "kanonik",
      "BIAYA TELAT NON-JOB L3 | WO: WO-0007 | Alasan: Denda keterlambatan supplier",
      { workOrderNo: "WO-0007", reason: "Denda keterlambatan supplier" },
    ],
    [
      "tanpa spasi pemisah",
      "BIAYA TELAT NON-JOB L3|WO:WO-0007|Alasan:tanpa spasi",
      { workOrderNo: "WO-0007", reason: "tanpa spasi" },
    ],
    [
      "spasi ganda + trailing",
      "BIAYA TELAT NON-JOB L3  |  WO:  WO-0007  |  Alasan:  spasi ganda  ",
      { workOrderNo: "WO-0007", reason: "spasi ganda" },
    ],
    [
      "tab sebagai pemisah",
      "BIAYA TELAT NON-JOB L3\t|\tWO:\tWO-4\t|\tAlasan:\ttab",
      { workOrderNo: "WO-4", reason: "tab" },
    ],
    [
      "NBSP sesudah penanda (\\s JS memuat NBSP)",
      "BIAYA TELAT NON-JOB L3 | WO: WO-5 | Alasan: nbsp-sep",
      { workOrderNo: "WO-5", reason: "nbsp-sep" },
    ],
    [
      "NBSP sebelum nomor WO",
      "BIAYA TELAT NON-JOB L3 | WO: WO-5 | Alasan: nbsp-wo",
      { workOrderNo: "WO-5", reason: "nbsp-wo" },
    ],
    ["kapital beda ditolak", "biaYa TELAT NON-JOB L3 | WO: WO-2 | Alasan: r", null],
    ["label wo kecil ditolak", "BIAYA TELAT NON-JOB L3 | wo: WO-2 | Alasan: r", null],
    ["label alasan kecil ditolak", "BIAYA TELAT NON-JOB L3 | WO: WO-9 | alasan: kecil", null],
    ["penanda bukan awal baris", "xBIAYA TELAT NON-JOB L3 | WO: WO-2 | Alasan: r", null],
    ["spasi di awal baris", " BIAYA TELAT NON-JOB L3 | WO: WO-2 | Alasan: r", null],
    ["ekstensi penanda", "BIAYA TELAT NON-JOB L3X | WO: W | Alasan: r", null],
    ["penanda saja", "BIAYA TELAT NON-JOB L3", null],
    ["tanpa alasan label", "BIAYA TELAT NON-JOB L3 | WO: WO-0007", null],
    ["WO kosong", "BIAYA TELAT NON-JOB L3 | WO:  | Alasan: r", null],
    ["WO mengandung spasi", "BIAYA TELAT NON-JOB L3 | WO: WO 1 | Alasan: r", null],
    // Client lama `(.*)`: alasan kosong di akhir baris tetap ter-parse
    // (server `(.+)` menolak; vonis akhir tetap server).
    [
      "alasan kosong akhir baris",
      "BIAYA TELAT NON-JOB L3 | WO: WO-1 | Alasan:",
      { workOrderNo: "WO-1", reason: "" },
    ],
    [
      "alasan hanya spasi",
      "BIAYA TELAT NON-JOB L3 | WO: WO-1 | Alasan: ",
      { workOrderNo: "WO-1", reason: "" },
    ],
    [
      "pipa di dalam alasan",
      "BIAYA TELAT NON-JOB L3 | WO: WO-6 | Alasan: r | x",
      { workOrderNo: "WO-6", reason: "r | x" },
    ],
    [
      "pipa di dalam token WO (rakus regex lama)",
      "BIAYA TELAT NON-JOB L3 | WO: WO|1 | Alasan: x",
      { workOrderNo: "WO|1", reason: "x" },
    ],
    [
      "pipa menempel token WO",
      "BIAYA TELAT NON-JOB L3 | WO: WO-7|Alasan: menempel",
      { workOrderNo: "WO-7", reason: "menempel" },
    ],
    [
      "baris kedua",
      "catatan\nBIAYA TELAT NON-JOB L3 | WO: WO-2 | Alasan: baris dua",
      { workOrderNo: "WO-2", reason: "baris dua" },
    ],
    [
      "penanda pertama menang",
      "BIAYA TELAT NON-JOB L3 | WO: WO-2 | Alasan: r1\nBIAYA TELAT NON-JOB L3 | WO: WO-3 | Alasan: r2",
      { workOrderNo: "WO-2", reason: "r1" },
    ],
    [
      "alasan berhenti di akhir baris",
      "BIAYA TELAT NON-JOB L3 | WO: WO-8 | Alasan: r  \nbaris lain",
      { workOrderNo: "WO-8", reason: "r" },
    ],
    [
      "CRLF: baris rusak dilewati, baris sah dibaca",
      "BIAYA TELAT NON-JOB L3 | WO: AB\r\nBIAYA TELAT NON-JOB L3 | WO: CD | Alasan: crlf",
      { workOrderNo: "CD", reason: "crlf" },
    ],
    // Penyimpangan disengaja tunggal (selaras server): regex lama menelan
    // "\n" lewat \s* sehingga alasan bocor dari baris berikut; parser
    // per baris tidak. Format baku formatL3TagClient selalu satu baris.
    [
      "alasan tidak bocor lintas baris",
      "BIAYA TELAT NON-JOB L3 | WO: WO-1 | Alasan:\ncatatan",
      { workOrderNo: "WO-1", reason: "" },
    ],
    [
      "pemisah tidak menyeberang baris",
      "BIAYA TELAT NON-JOB L3\n| WO: WO-1 | Alasan: x",
      null,
    ],
  ])("parse: %s", (_label, input, expected) => {
    expect(parseL3TagClient(input)).toEqual(expected)
  })

  it("upsert mengganti baris penanda di tengah/CRLF dan mempertahankan teks lain", () => {
    expect(
      upsertL3Tag(
        "catatan\nBIAYA TELAT NON-JOB L3 | WO: WO-1 | Alasan: R1\nlain",
        "WO-2",
        "R2",
      ),
    ).toBe("catatan\nBIAYA TELAT NON-JOB L3 | WO: WO-2 | Alasan: R2\nlain")
    expect(
      upsertL3Tag(
        "catatan\r\nBIAYA TELAT NON-JOB L3 | WO: WO-1 | Alasan: R1\r\nlain",
        "WO-2",
        "R2",
      ),
    ).toBe("catatan\r\nBIAYA TELAT NON-JOB L3 | WO: WO-2 | Alasan: R2\r\nlain")
  })

  it("remove menangani CRLF dan baris terakhir tanpa menyisakan pemisah yatim", () => {
    expect(
      removeL3Tag("catatan\r\nBIAYA TELAT NON-JOB L3 | WO: WO-1 | Alasan: R1\r\nlain"),
    ).toBe("catatan\r\nlain")
    expect(
      removeL3Tag("pra\nBIAYA TELAT NON-JOB L3 | WO: WO-1 | Alasan: R1"),
    ).toBe("pra")
    expect(removeL3Tag("BIAYA TELAT NON-JOB L3 | WO: WO-1 | Alasan: R1")).toBe("")
  })

  it("urutan form: centang -> isi WO -> isi alasan berakhir satu baris persis, tanpa baris perantara tertinggal", () => {
    let notes = upsertL3Tag("", "", "")
    notes = upsertL3Tag(notes, "WO-0007", "")
    notes = upsertL3Tag(notes, "WO-0007", "Denda keterlambatan supplier")
    expect(notes).toBe(
      "BIAYA TELAT NON-JOB L3 | WO: WO-0007 | Alasan: Denda keterlambatan supplier",
    )
    expect(removeL3Tag(notes)).toBe("")
    expect(removeL3Tag(upsertL3Tag("", "", ""))).toBe("")
  })

  it("input patologis panjang selesai tanpa backtracking", () => {
    const evil =
      "BIAYA TELAT NON-JOB L3" + " ".repeat(200_000) + "X\n" + "x".repeat(1_000)
    expect(parseL3TagClient(evil)).toBeNull()
    expect(upsertL3Tag(evil, "WO-1", "R")).toContain("WO-1")
  })
})

// css:S9424: `-webkit-appearance: auto` tidak valid; `appearance: auto`
// standar yang mengembalikan panah native select rdp dipertahankan dan
// baris -webkit- tidak boleh kembali.
describe("globals.css — dropdown rdp (css:S9424)", () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, "../../../app/globals.css"),
    "utf-8",
  )

  it("tidak ada -webkit-appearance: auto di globals.css", () => {
    expect(css).not.toContain("-webkit-appearance: auto")
  })

  it("aturan select rdp mempertahankan appearance: auto standar", () => {
    const rule = css.match(/\.rdp-dropdown_month select,\s*\.rdp-dropdown_year select \{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule![1]).toContain("appearance: auto;")
    expect(rule![1]).not.toContain("-webkit-appearance")
  })
})
