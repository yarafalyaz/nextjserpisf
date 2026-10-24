import { describe, expect, it } from "vitest"
import {
  effectivePhotoCategory,
  groupPhotosByParent,
  pairBeforeAfter,
  type PhotoAttachmentRow,
} from "../attachment-photo"

function row(partial: Partial<PhotoAttachmentRow>): PhotoAttachmentRow {
  return {
    id: 1,
    referenceType: "work_order",
    referenceId: 9,
    originalName: "foto.jpg",
    fileUrl: "/api/attachments/work_order/x.jpg",
    mimeType: "image/jpeg",
    photoCategory: null,
    verifiedBy: null,
    verifiedAt: null,
    publishedBy: null,
    publishedAt: null,
    uploadedBy: 3,
    createdAt: new Date("2026-10-24T01:00:00Z"),
    ...partial,
  }
}

describe("attachment-photo builder F-096-S", () => {
  it("baris lama null dibaca other + masuk ember belum berkategori (BR-PHOTO-02/09)", () => {
    expect(effectivePhotoCategory(null)).toBe("other")
    expect(effectivePhotoCategory("ngawur")).toBe("other")
    const grouped = groupPhotosByParent([row({ id: 1 }), row({ id: 2, photoCategory: "intake" })])
    expect(grouped.uncategorized.map((p) => p.id)).toEqual([1])
    expect(grouped.groups[0].photos[1].categoryLabel).toBe("Kondisi awal (intake)")
  })

  it("kelompok per induk tidak tertukar tahap proyek vs operasi WO (BR-PHOTO-01)", () => {
    const grouped = groupPhotosByParent(
      [
        row({ id: 1, referenceType: "project_stage", referenceId: 5, photoCategory: "progress" }),
        row({ id: 2, referenceType: "work_order_operation", referenceId: 5, photoCategory: "progress" }),
      ],
      { "project_stage:5": "Las & fitting", "work_order_operation:5": "Bongkar" },
    )
    expect(grouped.groups).toHaveLength(2)
    expect(grouped.groups.map((g) => g.parentLabel).sort()).toEqual(["Bongkar", "Las & fitting"])
  })

  it("published hanya terbit + kategori boleh-terbit; defect tidak pernah ikut (BR-PHOTO-08)", () => {
    const stamp = { verifiedBy: 7, verifiedAt: new Date(), publishedBy: 8, publishedAt: new Date() }
    const grouped = groupPhotosByParent([
      row({ id: 1, photoCategory: "progress", ...stamp }),
      row({ id: 2, photoCategory: "defect", ...stamp }),
      row({ id: 3, photoCategory: "handover" }),
    ])
    expect(grouped.published.map((p) => p.id)).toEqual([1])
  })

  it("before/after hanya pasangan WO yang diberikan; tanpa handover = hasHandover false (AC-PHOTO-7)", () => {
    const pair = pairBeforeAfter([row({ id: 1, photoCategory: "intake" })])
    expect(pair.before).toHaveLength(1)
    expect(pair.after).toHaveLength(0)
    expect(pair.hasHandover).toBe(false)
  })

  it("falsifikasi progres: builder murni tidak mengubah persen/status apa pun (BR-PHOTO-04)", () => {
    const rows = [row({ id: 1, photoCategory: "progress" })]
    const snapshot = JSON.stringify(rows)
    groupPhotosByParent(rows)
    pairBeforeAfter(rows)
    expect(JSON.stringify(rows)).toBe(snapshot)
  })
})
