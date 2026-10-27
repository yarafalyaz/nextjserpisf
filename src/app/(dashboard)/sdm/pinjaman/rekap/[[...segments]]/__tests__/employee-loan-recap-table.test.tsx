// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { EmployeeLoanRecapTable } from "../../../_components/employee-loan-recap-table"
import {
  EMPLOYEE_LOAN_RECAP_INACTIVE_LABEL,
  EMPLOYEE_LOAN_RECAP_NEGATIVE_LABEL,
  EMPLOYEE_LOAN_RECAP_NOTICE,
  EMPLOYEE_LOAN_RECAP_NO_DEPARTMENT_LABEL,
  EMPLOYEE_LOAN_RECAP_NO_WEEKLY_LABEL,
  EMPLOYEE_LOAN_RECAP_PENDING_LABEL,
  EMPLOYEE_LOAN_RECAP_UNKNOWN_STATUS_LABEL,
  type EmployeeLoanRecap,
} from "@/lib/reports/employee-loan-recap"
import {
  renderCard,
  unmountCard,
  clearRenderedCards,
} from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const RECAP: EmployeeLoanRecap = {
  notice: EMPLOYEE_LOAN_RECAP_NOTICE,
  employees: [
    {
      employeeId: 7,
      employeeName: "Budi Santoso",
      departmentId: 2,
      departmentName: "Bengkel",
      activeCount: 2,
      totalPrincipalActive: 10_000_000,
      totalRemainingActive: 6_500_000,
      totalPaidDerived: 3_500_000,
      monthlyInstallmentTotal: 750_000,
      weeklyInstallmentTotal: 125_000,
      activeWithoutWeeklyCount: 1,
      oldestActiveLoanDate: new Date("2026-03-02T00:00:00"),
      pendingCount: 1,
      unknownStatusCount: 0,
      unknownStatuses: [],
      isInactiveWithActiveLoans: true,
      hasNegativeRemaining: false,
      negativeRemainingCount: 0,
    },
    {
      employeeId: 9,
      employeeName: null,
      departmentId: null,
      departmentName: null,
      activeCount: 1,
      totalPrincipalActive: 2_000_000,
      totalRemainingActive: -50_000,
      totalPaidDerived: 2_050_000,
      monthlyInstallmentTotal: 200_000,
      weeklyInstallmentTotal: 0,
      activeWithoutWeeklyCount: 0,
      oldestActiveLoanDate: new Date("2026-08-10T00:00:00"),
      pendingCount: 0,
      unknownStatusCount: 1,
      unknownStatuses: ["frozen"],
      isInactiveWithActiveLoans: false,
      hasNegativeRemaining: true,
      negativeRemainingCount: 1,
    },
  ],
  // Totals server SENGAJA divergen dari Σ baris tampil (mis. server menjumlah
  // cakupan lebih luas dari baris contoh): hitung-ulang UI atas baris mana pun
  // tidak akan pernah menghasilkan angka ini, jadi asersi total di bawah hanya
  // hijau bila komponen menempel totals server apa adanya.
  totals: {
    employeeCount: 2,
    activeCount: 3,
    totalPrincipalActive: 12_345_111,
    totalRemainingActive: 6_777_111,
    totalPaidDerived: 5_567_111,
    monthlyInstallmentTotal: 977_111,
    weeklyInstallmentTotal: 177_111,
    activeWithoutWeeklyCount: 1,
    pendingCount: 1,
    unknownStatusCount: 1,
    inactiveWithActiveLoansCount: 1,
    negativeRemainingCount: 1,
  },
}

describe("EmployeeLoanRecapTable F-2026-10-25-046-S", () => {
  it("menampilkan notice, angka verbatim berlabel frekuensi terpisah, total server, ember verbatim", () => {
    const { container, root } = renderCard(<EmployeeLoanRecapTable recap={RECAP} />)
    const text = container.textContent ?? ""
    const headers = [...container.querySelectorAll("th")].map((th) => th.textContent ?? "")

    expect(container.querySelector('[aria-label="Rekap sisa pinjaman per karyawan"]')).not.toBeNull()
    expect(text).toContain(EMPLOYEE_LOAN_RECAP_NOTICE)
    expect(text).toContain("Budi Santoso")
    expect(text).toContain("Karyawan #9")
    expect(text).toContain(EMPLOYEE_LOAN_RECAP_NO_DEPARTMENT_LABEL)
    // Angka verbatim payload baris (format id-ID), bukan hitungan ulang UI.
    expect(text).toContain("Rp 10.000.000")
    expect(text).toContain("Rp 6.500.000")
    expect(text).toContain("Rp 3.500.000")
    // Total server terikat elemen spesifik: kartu ringkasan + sel footer.
    // Nilai fixture totals divergen dari Σ baris (6.500.000 + -50.000 =
    // 6.450.000), jadi hitung-ulang UI atas baris — termasuk +1 — gagal di sini.
    const summary = container.querySelector('[aria-label="Ringkasan rekap pinjaman"]')
    expect(summary).not.toBeNull()
    const summaryLabels = [...(summary?.querySelectorAll("div > p:first-child") ?? [])]
    const remainingCard = summaryLabels.find(
      (label) => label.textContent === "Total sisa pinjaman aktif",
    )?.nextElementSibling
    expect(remainingCard?.textContent).toBe("Rp 6.777.111")
    // Kunci urutan kolom lengkap supaya pergeseran kolom memerahkan asersi sel.
    expect(headers).toEqual([
      "Karyawan",
      "Departemen",
      "Pinjaman aktif",
      "Pokok aktif",
      "Sisa pinjaman",
      "Terbayar tercatat",
      "Cicilan bulanan",
      "Cicilan mingguan",
      "Pinjaman aktif tertua",
      "Catatan",
      "Daftar pinjaman",
    ])
    const footCells = [...container.querySelectorAll("tfoot td")].map(
      (td) => td.textContent ?? "",
    )
    // Sel footer (sel "Total" colSpan=2 = satu elemen): aktif | pokok | sisa | terbayar | bulanan | mingguan
    expect(footCells[0]).toBe("Total")
    expect(footCells[1]).toBe("3")
    expect(footCells[2]).toBe("Rp 12.345.111")
    expect(footCells[3]).toBe("Rp 6.777.111")
    expect(footCells[4]).toBe("Rp 5.567.111")
    expect(footCells[5]).toBe("Rp 977.111")
    expect(footCells[6]).toBe("Rp 177.111")
    // Cicilan bulanan vs mingguan: dua kolom terpisah berlabel frekuensi.
    expect(headers).toContain("Cicilan bulanan")
    expect(headers).toContain("Cicilan mingguan")
    expect(text).toContain("Rp 750.000")
    expect(text).toContain("Rp 125.000")
    // Tanggal pinjaman aktif tertua dari server.
    expect(text).toContain("2 Mar 2026")
    // Ember + penanda server verbatim.
    expect(text).toContain(EMPLOYEE_LOAN_RECAP_INACTIVE_LABEL)
    expect(text).toContain(`${EMPLOYEE_LOAN_RECAP_NO_WEEKLY_LABEL} (1 pinjaman)`)
    expect(text).toContain(`${EMPLOYEE_LOAN_RECAP_PENDING_LABEL} (1)`)
    expect(text).toContain(`${EMPLOYEE_LOAN_RECAP_UNKNOWN_STATUS_LABEL} (1): frozen`)
    // Sisa negatif tampil apa adanya, tidak di-clamp ke 0.
    expect(text).toContain("Rp -50.000")
    expect(text).toContain(`${EMPLOYEE_LOAN_RECAP_NEGATIVE_LABEL} (1 pinjaman)`)
    // Tanpa nominal gaji / proyeksi lunas.
    expect(text).not.toContain("gaji")
    expect(text).not.toContain("lunas pada")
    // Tautan daftar per karyawan ke daftar transaksional existing.
    const links = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(links).toContain("/sdm/pinjaman?cari=Budi%20Santoso")
    unmountCard(root)
  })

  it("keadaan kosong: pesan jujur tanpa tabel dan tanpa angka palsu", () => {
    const empty: EmployeeLoanRecap = {
      notice: EMPLOYEE_LOAN_RECAP_NOTICE,
      employees: [],
      totals: {
        employeeCount: 0,
        activeCount: 0,
        totalPrincipalActive: 0,
        totalRemainingActive: 0,
        totalPaidDerived: 0,
        monthlyInstallmentTotal: 0,
        weeklyInstallmentTotal: 0,
        activeWithoutWeeklyCount: 0,
        pendingCount: 0,
        unknownStatusCount: 0,
        inactiveWithActiveLoansCount: 0,
        negativeRemainingCount: 0,
      },
    }
    const { container, root } = renderCard(<EmployeeLoanRecapTable recap={empty} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Tidak ada pinjaman aktif atau menunggu persetujuan pada cakupan ini.")
    expect(container.querySelector("table")).toBeNull()
    expect(text).not.toContain(EMPLOYEE_LOAN_RECAP_NEGATIVE_LABEL)
    unmountCard(root)
  })

  it("tanpa penanda: tidak ada label nonaktif/negatif/status tak dikenal", () => {
    const clean: EmployeeLoanRecap = {
      ...RECAP,
      employees: RECAP.employees.map((employee) => ({
        ...employee,
        isInactiveWithActiveLoans: false,
        hasNegativeRemaining: false,
        negativeRemainingCount: 0,
        activeWithoutWeeklyCount: 0,
        pendingCount: 0,
        unknownStatusCount: 0,
        unknownStatuses: [],
      })),
      totals: {
        ...RECAP.totals,
        inactiveWithActiveLoansCount: 0,
        negativeRemainingCount: 0,
        activeWithoutWeeklyCount: 0,
        pendingCount: 0,
        unknownStatusCount: 0,
      },
    }
    const { container, root } = renderCard(<EmployeeLoanRecapTable recap={clean} />)
    const text = container.textContent ?? ""
    expect(text).not.toContain(EMPLOYEE_LOAN_RECAP_INACTIVE_LABEL)
    expect(text).not.toContain(EMPLOYEE_LOAN_RECAP_NEGATIVE_LABEL)
    expect(text).not.toContain(EMPLOYEE_LOAN_RECAP_NO_WEEKLY_LABEL)
    expect(text).not.toContain(EMPLOYEE_LOAN_RECAP_UNKNOWN_STATUS_LABEL)
    unmountCard(root)
  })
})
