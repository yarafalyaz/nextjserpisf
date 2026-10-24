// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import {
  groupPhotosByParent,
  pairBeforeAfter,
  type PhotoAttachmentRow,
} from "@/lib/reports/attachment-photo"
import {
  CustomerVehiclePhotoPanel,
  WorkOrderPhotoPanel,
} from "../work-order-photo-panel"

let seq = 0
function row(over: Partial<PhotoAttachmentRow>): PhotoAttachmentRow {
  seq += 1
  return {
    id: seq,
    referenceType: "work_order",
    referenceId: 7,
    originalName: `foto-${seq}.jpg`,
    fileUrl: `/uploads/foto-${seq}.jpg`,
    mimeType: "image/jpeg",
    photoCategory: null,
    verifiedBy: null,
    verifiedAt: null,
    publishedBy: null,
    publishedAt: null,
    uploadedBy: 3,
    createdAt: new Date(2026, 9, 24, 8, seq),
    ...over,
  }
}

function woPhotos(rows: PhotoAttachmentRow[]) {
  const grouped = groupPhotosByParent(rows, {
    "work_order:7": "Perintah kerja",
    "work_order_operation:11": "Pemasangan mesin",
  })
  return { ...grouped, ...pairBeforeAfter(rows) }
}

afterEach(() => {
  clearRenderedCards()
})

describe("WorkOrderPhotoPanel F-2026-10-24-096-S AC-PHOTO-3/5/7", () => {
  it("label kategori persis + grup per tahap + foto lama di ember Belum berkategori", () => {
    const rows = [
      row({ photoCategory: "intake", originalName: "awal.jpg" }),
      row({ referenceType: "work_order_operation", referenceId: 11, photoCategory: "progress", originalName: "progres.jpg" }),
      row({ photoCategory: null, originalName: "lama.jpg" }),
    ]
    const { container, root } = renderCard(<WorkOrderPhotoPanel photos={woPhotos(rows)} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Foto per Tahap Perintah Kerja"]')).not.toBeNull()
    expect(text).toContain("Kondisi awal (intake)")
    expect(text).toContain("Progres pengerjaan")
    expect(text).toContain("Belum berkategori")
    expect(text).toContain("Pemasangan mesin")
    expect(text).toContain("lama.jpg")
    expect(text).toContain("Belum terverifikasi")
    unmountCard(root)
  })

  it("pasangan before/after: tanpa handover tampil belum serah terima", () => {
    const rows = [row({ photoCategory: "intake", originalName: "awal.jpg" })]
    const { container, root } = renderCard(<WorkOrderPhotoPanel photos={woPhotos(rows)} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Kondisi awal (intake) — sebelum (1)")
    expect(text).toContain("Belum serah terima — belum ada foto serah terima")
    unmountCard(root)
  })

  it("pasangan before/after lengkap tampil sesudah berisi", () => {
    const rows = [
      row({ photoCategory: "intake" }),
      row({ photoCategory: "handover", originalName: "serah.jpg", verifiedBy: 9, verifiedAt: new Date(), publishedBy: 9, publishedAt: new Date() }),
    ]
    const { container, root } = renderCard(<WorkOrderPhotoPanel photos={woPhotos(rows)} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Serah terima — sesudah (1)")
    expect(text).toContain("Terverifikasi")
    expect(text).toContain("Terbit")
    unmountCard(root)
  })

  it("kosong tampil empty state panel", () => {
    const { container, root } = renderCard(<WorkOrderPhotoPanel photos={woPhotos([])} />)
    expect(container.textContent ?? "").toContain("Belum ada foto untuk perintah kerja ini")
    unmountCard(root)
  })

  it("panel kendaraan: label persis + ember belum berkategori tampil", () => {
    const rows = [
      row({ referenceType: "customer_vehicle", referenceId: 5, photoCategory: "defect", originalName: "cacat.jpg" }),
      row({ referenceType: "customer_vehicle", referenceId: 5, photoCategory: null, originalName: "lama-kendaraan.jpg" }),
    ]
    const grouped = groupPhotosByParent(rows, { "customer_vehicle:5": "Kendaraan pelanggan" })
    const { container, root } = renderCard(<CustomerVehiclePhotoPanel photos={grouped} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Foto Kendaraan Pelanggan"]')).not.toBeNull()
    expect(text).toContain("Temuan/cacat")
    expect(text).toContain("Belum berkategori")
    expect(text).toContain("lama-kendaraan.jpg")
    unmountCard(root)
  })
})
