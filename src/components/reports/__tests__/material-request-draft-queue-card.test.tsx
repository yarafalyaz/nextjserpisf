// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { MaterialRequestDraftQueueCard } from "../material-request-draft-queue-card"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { expectNoQueueButtons } from "./draft-queue-card-test-fixtures"
import {
  buildMaterialRequestDraftQueue,
  type MaterialRequestDraftInput,
  type MaterialRequestDraftQueue,
} from "@/lib/reports/material-request-draft-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const NOW = new Date("2026-10-25T22:00:00.000Z") // 05:00 WIB, 26 Okt 2026
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(over: Partial<MaterialRequestDraftInput> = {}): MaterialRequestDraftInput {
  return {
    materialRequestId: 1,
    slug: "mr-1",
    documentNo: "MR/2026/001",
    status: "draft",
    requesterWarehouseId: 10,
    requesterWarehouseName: "Gudang Tujuan Uji",
    sourceWarehouseId: 20,
    sourceWarehouseName: "Gudang Sumber Uji",
    workOrderId: 30,
    workOrderDocumentNo: "WO/2026/001",
    neededBy: null,
    createdByName: "Pembuat Uji",
    createdAt: day(-5),
    itemCount: 2,
    totalQty: 7,
    ...over,
  }
}

describe("MaterialRequestDraftQueueCard 071-F AC-MRQ-F1..F3", () => {
  let root: Root | undefined
  afterEach(() => {
    if (root) unmountCard(root)
    root = undefined
    clearRenderedCards()
  })

  it("AC-MRQ-F1: judul/kolom/notice verbatim server + rekap payload", () => {
    const queue = buildMaterialRequestDraftQueue(
      [
        input({}),
        input({
          materialRequestId: 2,
          slug: "mr-2",
          documentNo: "MR/2026/002",
          createdAt: day(-1),
          neededBy: day(-2),
        }),
      ],
      NOW,
    )
    const rendered = renderCard(<MaterialRequestDraftQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(
      rendered.container.querySelector('[aria-label="Antrean Permintaan Material Draft"]'),
    ).not.toBeNull()
    const headers = [...rendered.container.querySelectorAll("th")].map((el) => el.textContent)
    expect(headers).toEqual([
      "Menunggu",
      "No. Dokumen",
      "Gudang Tujuan",
      "Gudang Sumber",
      "Perintah Kerja",
      "Dibutuhkan",
      "Item",
      "Qty Permintaan",
      "Dibuat Oleh",
    ])
    for (const expected of [
      "Daftar ini hanya permintaan material yang masih draft dan belum diajukan. Permintaan draft belum disetujui dan belum memindahkan stok; ajukan, ubah, atau hapus lewat detail permintaan.",
      "1 mengendap · 1 menunggu diajukan · 2 permintaan draft",
      "Gudang Tujuan Uji: 2 permintaan (1 mengendap, 1 menunggu diajukan)",
      "Gudang Sumber Uji: 2 permintaan (1 mengendap, 1 menunggu diajukan)",
      "Mengendap",
      "5 hari",
      "Menunggu Diajukan",
      "1 hari",
      "Lewat Tanggal Dibutuhkan",
      "WO/2026/001",
      "Pembuat Uji",
    ]) {
      expect(text).toContain(expected)
    }
    // Kata Terlambat dilarang untuk draft (BR-MRQ-07) — penanda fakta saja.
    expect(text).not.toContain("Terlambat")
  })

  it("AC-MRQ-F1: passthrough umur/tingkat/count/qty buatan — tampil payload, bukan hitung-ulang", () => {
    const base = input({ createdAt: day(-1) })
    const queue: MaterialRequestDraftQueue = {
      rows: [
        {
          ...base,
          tingkat: "mengendap",
          tingkatLabel: "Mengendap",
          umurDraftHari: 99,
          umurDariMasaDepan: false,
          neededByLampau: false,
          neededByLampauLabel: null,
        },
      ],
      levelCounts: { mengendap: 42, menunggu: 3 },
      requesterWarehouseCounts: [
        {
          warehouseId: 10,
          warehouseName: "Gudang Tujuan Uji",
          levelCounts: { mengendap: 40, menunggu: 2 },
          total: 42,
        },
      ],
      sourceWarehouseCounts: [
        {
          warehouseId: 20,
          warehouseName: "Gudang Sumber Uji",
          levelCounts: { mengendap: 41, menunggu: 1 },
          total: 42,
        },
      ],
      totalDocuments: 45,
    }
    const rendered = renderCard(<MaterialRequestDraftQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain("99 hari")
    expect(text).not.toContain("1 hari")
    expect(text).toContain("42 mengendap · 3 menunggu diajukan · 45 permintaan draft")
    expect(text).toContain("Gudang Tujuan Uji: 42 permintaan (40 mengendap, 2 menunggu diajukan)")
    expect(text).toContain("Gudang Sumber Uji: 42 permintaan (41 mengendap, 1 menunggu diajukan)")
    const cells = [...rendered.container.querySelectorAll("tbody tr")][0]?.children
    expect(cells?.[6]?.textContent).toBe("2")
    expect(cells?.[7]?.textContent).toBe("7")
  })

  it("AC-MRQ-F2: urutan payload dipertahankan; WO/pembuat/neededBy kosong tampil —", () => {
    const queue = buildMaterialRequestDraftQueue(
      [
        input({
          materialRequestId: 2,
          slug: "mr-2",
          documentNo: "MR/2026/002",
          createdAt: day(-1),
          workOrderId: null,
          workOrderDocumentNo: null,
          createdByName: null,
        }),
        input({}),
      ],
      NOW,
    )
    const rendered = renderCard(<MaterialRequestDraftQueueCard queue={queue} />)
    root = rendered.root
    const rowsDom = [...rendered.container.querySelectorAll("tbody tr")]
    expect(rowsDom).toHaveLength(2)
    // Builder mengurut mengendap dulu: MR/2026/001 (5 hari) sebelum 002.
    expect(rowsDom[0]?.textContent).toContain("MR/2026/001")
    expect(rowsDom[1]?.textContent).toContain("MR/2026/002")
    expect(rowsDom[1]?.children[4]?.textContent).toBe("—")
    expect(rowsDom[1]?.children[5]?.textContent).toBe("—")
    expect(rowsDom[1]?.children[8]?.textContent).toBe("—")
  })

  it("AC-MRQ-F3: tanpa nilai/label stok + nol tombol aksi; tautan hanya detail permintaan", () => {
    const queue = buildMaterialRequestDraftQueue([input({})], NOW)
    const rendered = renderCard(<MaterialRequestDraftQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    for (const banned of [
      "Rp",
      "Ajukan",
      "Setujui",
      "Buat Transfer",
      "Hapus",
      "Sisa Kebutuhan",
      "Stok Tersedia",
      "Nilai Permintaan",
      "Terlambat",
    ]) {
      expect(text).not.toContain(banned)
    }
    expect(rendered.container.innerHTML).not.toContain("title=")
    expectNoQueueButtons(rendered.container)
    expect(rendered.container.querySelector("form")).toBeNull()
    const hrefs = [...rendered.container.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(hrefs).toEqual(["/inventaris/permintaan-gudang/mr-1"])
  })

  it("kosong: teks kosong tampil, tanpa tabel", () => {
    const queue = buildMaterialRequestDraftQueue([], NOW)
    const rendered = renderCard(<MaterialRequestDraftQueueCard queue={queue} />)
    root = rendered.root
    expect(rendered.container.textContent ?? "").toContain("Tidak ada permintaan material Draf.")
    expect(rendered.container.querySelector("table")).toBeNull()
  })
})
