/**
 * F-2026-10-21-019: konteks lembar waktu tepat satu — proyek XOR perintah
 * kerja. Penjaga murni (tanpa Prisma) supaya teruji langsung; pemanggil di
 * server action menegakkannya SEBELUM tulis (Zod saja tidak cukup karena
 * FormData edit bisa menghilangkan field).
 */
export function timesheetContextError(v: {
  projectId?: number | null
  workOrderId?: number | null
  taskId?: number | null
}): string | null {
  const hasProject = v.projectId != null
  const hasWorkOrder = v.workOrderId != null
  if (hasProject === hasWorkOrder) {
    return "Lembar waktu wajib terikat ke tepat satu konteks: proyek atau perintah kerja (tidak boleh keduanya atau kosong)."
  }
  if (hasWorkOrder && v.taskId != null) {
    return "Tugas hanya dapat dipakai pada lembar waktu konteks proyek, bukan perintah kerja."
  }
  return null
}

/** WO selesai/batal tidak menerima catatan jam maupun tarikan biaya baru. */
export function closedWorkOrderError(
  status: string,
  verb: "dicatat" | "ditarik",
): string | null {
  if (status === "completed" || status === "cancelled") {
    return `Lembar waktu tidak dapat ${verb} pada perintah kerja berstatus '${status}'.`
  }
  return null
}
