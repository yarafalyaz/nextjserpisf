---
name: deslop-ui
description: "Master UI/UX orchestrator skill that combines antislop, better-ui, baseline-ui, typography, accessibility, mobile responsiveness, and Font Awesome iconography. Call via @deslop-ui or when user asks to polish, deslop, or revamp UI/UX."
user-invokable: true
---

# Master UI/UX Orchestrator (`deslop-ui`)

> Gabungan terintegrasi dari seluruh skill antislop, better-ui, baseline-ui, a11y, dan Font Awesome untuk memperbaiki tampilan antarmuka (UI) dan alur pengguna (UX) secara tuntas dan konsisten standar Enterprise ERP.

Ketika dipanggil melalui `@deslop-ui`, lakukan proses review dan perbaikan UI/UX dengan urutan fondasi berikut:

---

## 1. Filter Anti-Slop (`antislop`, `antislop-ui`, `baseline-ui`)
- **Tanpa Gradien/Gimmick Liar**: Dilarang menggunakan gradien biru-ungu generik (`blue-to-purple`), glow mengambang, radial orb, atau background dot/grid tanpa alasan domain bisnis.
- **Batasan Glassmorphism (R-10)**: Maksimal 1–2 elemen per layar (mis. sticky navbar dan table header); dilarang menumpuk blur pada card, modal, dan sidebar sekaligus.
- **Pembersihan Copywriting (R-02)**: Dilarang menggunakan karakter em dash (`—`) pada teks UI. Gunakan koma (`,`), titik dua (`:`), tanda hubung (`-`), atau tanda kurung `()`.
- **Tanpa AI Buzzword**: Tidak boleh ada istilah klise (*"AI Powered", "Seamless", "Revolutionary"*) atau CTA generik kosong (*"Get Started", "Learn More"*).

---

## 2. Fondasi Visual & Permukaan (`better-ui`, `better-colors`, `DESIGN.md`)
- **Struktur Kartu & Metrik**: Hindari kartu metrik mengambang yang terisolasi. Gunakan strip terpadu (`grid divide-x divide-border bg-card border border-border`).
- **Shadow & Radius**:
  - Shadow hanya untuk elevasi interaktif nyata (`shadow-2xs` atau `shadow-xs`).
  - Radius konsisten (`rounded-lg` untuk card/tabel, `rounded-md` untuk button/input).
- **Warna Status Semantik**:
  - Emerald untuk status posted/sukses.
  - Amber untuk status pending/menunggu.
  - Red untuk status mengendap/danger/overdue.
  - Neutral/Zinc untuk metadata sekunder.

---

## 3. Tipografi & Data Tabular (`better-typography`)
- **Angka Finansial & Kode**: Selalu gunakan `tabular-nums` dan font mono untuk angka uang, tanggal kalender, kuantitas stok, NPWP, dan nomor dokumen agar digit selalu sejajar secara vertikal.
- **Keterbacaan Teks**: Gunakan `text-balance` pada judul header dan `text-pretty` pada paragraf deskripsi/notice.

---

## 4. Aksesibilitas & Human Factors (`better-accessibility`, `antislop-human`)
- **Target Sentuh Mobile**: Minimal 44px (`min-h-11 sm:min-h-9`) untuk semua tombol interaktif.
- **Affordance Pointer**: Semua elemen interaktif (`a[href]`, `button`, dropdown) wajib memiliki `cursor: pointer`.
- **Keyboard Navigation**: Pastikan focus-ring terlihat dan urutan Tab logis.
- **Pemberian Label (Accessible Names)**: Semua ikon tombol mandiri wajib memiliki `aria-label` dan `aria-hidden="true"` pada elemen SVG.

---

## 5. Sistem Ikonografi (`setup-fa`, `suggest-icon`, Font Awesome)
- Semua icon wajib menggunakan **Font Awesome** via `@/components/ui/fontawesome-icons`.
- Setiap glif harus memiliki relevansi fungsional domain bisnis riil:
  - `Receipt` / `FileText`: Faktur, klaim, atau dokumen keuangan.
  - `ShoppingCart` / `BagShopping`: Penjualan & pesanan.
  - `Truck`: Pengiriman & logistik.
  - `Clock`: Waktu tunggu atau durasi.
  - `AlertTriangle`: Status mengendap atau perhatian audit.
