import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn() }))

import { parseL3Tag } from "../late-cost-l3.service"
import { parseSentResiFromNotes } from "../warranty-journal.service"

// S8786: parser manual pengganti regex rawan backtracking super-linear wajib
// setara regex lama pada tabel kasus tepi ini (perilaku lama dirumuskan ulang
// sebagai ekspektasi eksplisit, bukan regex lama yang dipertahankan).
describe("S8786 ekuivalensi parseL3Tag (regex lama -> parser manual)", () => {
  it.each<[string | null | undefined, unknown]>([
    ["", null],
    ["  ", null],
    [null, null],
    [undefined, null],
    ["catatan biasa", null],
    [
      "BIAYA TELAT NON-JOB L3 | WO: WO-0007 | Alasan: jasa bubut telat",
      { workOrderNo: "WO-0007", reason: "jasa bubut telat" },
    ],
    [
      "BIAYA TELAT NON-JOB L3  |  WO:  WO-0007  |  Alasan:  spasi ganda  ",
      { workOrderNo: "WO-0007", reason: "spasi ganda" },
    ],
    [
      "BIAYA TELAT NON-JOB L3|WO:WO-0007|Alasan:tanpa spasi",
      { workOrderNo: "WO-0007", reason: "tanpa spasi" },
    ],
    // `(.+)` lama: spasi sesudah `Alasan:` terhitung isi -> alasan kosong lolos.
    ["BIAYA TELAT NON-JOB L3 | WO: WO-0007 | Alasan: ", { workOrderNo: "WO-0007", reason: "" }],
    ["BIAYA TELAT NON-JOB L3 | WO: WO-0007 | Alasan:", null],
    ["BIAYA TELAT NON-JOB L3 | WO: WO-0007", null],
    [
      "catatan\nBIAYA TELAT NON-JOB L3 | WO: WO-2 | Alasan: baris dua",
      { workOrderNo: "WO-2", reason: "baris dua" },
    ],
    [
      "BIAYA TELAT NON-JOB L3 | WO: WO-2 | Alasan: r1\nBIAYA TELAT NON-JOB L3 | WO: WO-3 | Alasan: r2",
      { workOrderNo: "WO-2", reason: "r1" },
    ],
    ["xBIAYA TELAT NON-JOB L3 | WO: WO-2 | Alasan: r", null],
    [" BIAYA TELAT NON-JOB L3 | WO: WO-2 | Alasan: r", null],
    ["biaYa TELAT NON-JOB L3 | WO: WO-2 | Alasan: r", null],
    [
      "BIAYA TELAT NON-JOB L3\t|\tWO:\tWO-4\t|\tAlasan:\ttab",
      { workOrderNo: "WO-4", reason: "tab" },
    ],
    [
      "BIAYA TELAT NON-JOB L3 | WO: WO-5 | Alasan: nbsp-sep",
      { workOrderNo: "WO-5", reason: "nbsp-sep" },
    ],
    [
      "BIAYA TELAT NON-JOB L3 | WO: WO-6 | Alasan: r | x",
      { workOrderNo: "WO-6", reason: "r | x" },
    ],
    [
      "BIAYA TELAT NON-JOB L3 | WO: WO-7|Alasan: menempel",
      { workOrderNo: "WO-7", reason: "menempel" },
    ],
    ["BIAYA TELAT NON-JOB L3 | WO:  | Alasan: r", null],
    [
      "BIAYA TELAT NON-JOB L3 | WO: WO-8 | Alasan: r  \nbaris lain",
      { workOrderNo: "WO-8", reason: "r" },
    ],
    ["BIAYA TELAT NON-JOB L3 | WO: WO-9 | alasan: kecil", null],
    [
      "BIAYA TELAT NON-JOB L3 | WO: AB\r\nBIAYA TELAT NON-JOB L3 | WO: CD | Alasan: crlf",
      { workOrderNo: "CD", reason: "crlf" },
    ],
    ["BIAYA TELAT NON-JOB L3", null],
    ["BIAYA TELAT NON-JOB L3X | WO: W | Alasan: r", null],
  ])("%j -> %j", (input, expected) => {
    expect(parseL3Tag(input)).toEqual(expected)
  })
})

describe("S8786 ekuivalensi parseSentResiFromNotes (regex lama -> parser manual)", () => {
  it.each<[string | null | undefined, string | null]>([
    [null, null],
    [undefined, null],
    ["", null],
    ["tanpa penanda", null],
    ["[Resi pengiriman klaim supplier: RESI-1]", "RESI-1"],
    ["Catatan staf\n[Resi pengiriman klaim supplier: RESI-1]", "RESI-1"],
    ["[Resi pengiriman klaim supplier: ]", null],
    ["[Resi pengiriman klaim supplier:   ]", null],
    ["[Resi pengiriman klaim supplier:]", null],
    ["[Resi pengiriman klaim supplier: A]B]", "A"],
    [
      "a [Resi pengiriman klaim supplier: X] b [Resi pengiriman klaim supplier: Y]",
      "X",
    ],
    ["[Resi pengiriman klaim supplier:  RESI-9  ]", "RESI-9"],
    ["[Resi pengiriman klaim supplier: R E S I]", "R E S I"],
    ["[Resi pengiriman klaim supplier:\nRESI-LF]", "RESI-LF"],
    ["[Resi pengiriman klaim supplier:\tRESI-TAB]", "RESI-TAB"],
    ["[Resi pengiriman klaim supplier: RESI-NBSP]", "RESI-NBSP"],
    ["[resi pengiriman klaim supplier: kecil]", null],
    ["Resi pengiriman klaim supplier: TANPA-KURUNG]", null],
    ["[Resi pengiriman klaim supplier: BELUM-TUTUP", null],
    ["[Resi pengiriman klaim supplier: A[B]", "A[B"],
  ])("%j -> %j", (input, expected) => {
    expect(parseSentResiFromNotes(input)).toBe(expected)
  })
})
