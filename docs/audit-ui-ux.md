# Audit UI/UX — YaraERP

Tanggal: 2026-10-15 · Lingkup: seluruh permukaan UI (`src/app/**`, `src/components/**`, `src/lib/pdf/**`, `src/app/globals.css`, `src/app/print.css`)
Status: **sebagian sudah diperbaiki** — lihat "Status perbaikan" di bawah. Sisanya masih terbuka.

## Metode & bukti yang dijalankan

| Lapisan | Yang dijalankan | Hasil |
| --- | --- | --- |
| Kompilasi | `/_next/mcp` → `get_compilation_issues` (port 3005) | `{"issues":[]}` — bersih |
| Runtime error | `/_next/mcp` → `get_errors` | `{configErrors:[], sessionErrors:[]}` — bersih |
| Guard test invarian UI | `vitest run` 10 berkas guard (parity nav/breadcrumb, section-lists, report-url-convention, slug-coverage, form-date-integrity, form-edit-seeds-existing, wired-transition-actions, sensitive-route, document-scope, permission-seed) | 35 test lulus |
| Sweep browser | Chrome headless, 1440px (light+dark) dan 390px, 102 rute statis `(dashboard)` | 0 error tak terduga, 0 overflow horizontal, 0 teks `undefined`/`NaN` |
| Kontras dark mode | pengukuran token nyata di `html.dark` (via `localStorage.theme=dark` — mekanisme asli aplikasi) | lihat temuan D1/D2 |
| Audit statis paralel | 5 subagent terpisah (a11y, tema/print, state & feedback, responsif, teks) | temuan di bawah, tiap klaim saya verifikasi ulang sendiri |

## Temuan

Severity: **tinggi** = merusak/menghilangkan informasi yang dilihat user; **sedang** = menghambat atau melanggar konvensi yang sudah ditetapkan repo; **rendah** = kosmetik/konsistensi.

### D1. [tinggi] Dark mode: `bg-primary text-white` → teks/ikon hilang (kontras 1.04:1)

Di dark, `--color-primary: #fafafa` (`globals.css:251`) sehingga `bg-primary` nyaris putih, sementara teksnya putih.

- Bukti runtime (diukur di `html.dark` asli): `bg-primary text-white` → **1.04:1**; `bg-success text-white` → 1.92:1; `bg-warning text-white` → 1.67:1; `bg-danger text-white` → 2.77:1; pasangan yang benar `bg-primary text-primary-foreground` → 17.18:1.
- Lokasi: `src/app/(dashboard)/proyek/_components/project-stages.tsx:194` (ikon Play penanda tahap **aktif** jadi tak terlihat), `:192`, `:193`, `:300`.
- Perbaikan: ganti `text-white` → `text-primary-foreground` (atau token foreground yang gelap di dark).

### D2. [sedang] Dark mode: `text-white` di atas token `success/warning/danger` (kontras 1.67–2.77:1)

- `src/app/(dashboard)/sdm/penggajian/[slug]/_components/approve-button.tsx:31`
- `src/app/(dashboard)/pengaturan/persetujuan/[slug]/page.tsx:131` (cabang `isDone`; cabang `isActive` di baris yang sama sudah benar memakai `text-primary-foreground`)
- `src/app/(dashboard)/penjualan/faktur/[slug]/page.tsx:119` (`bg-[var(--color-success)] text-white`)
- `src/components/ui/confirm-dialog.tsx:52,58,76` dan `src/components/ui/button.tsx:80`
- `src/components/dashboard/charts.tsx:436,452` (chip legenda aktif)
- Perbaikan: pakai token foreground gelap, jangan `text-white`.

### D3. [sedang] Tombol "Cetak" masih mencetak HTML aplikasi, bukan PDF engine

- `src/components/reports/export-buttons.tsx:78,82-86` — `handlePrint` memakai `pdfHref` **kalau ada**, kalau tidak jatuh ke `window.print()` (cetak markup aplikasi).
- Hanya **7 halaman laporan** yang mengirim `pdfHref=`: `laba-rugi`, `neraca`, `neraca-saldo`, `aset-tetap`, `mutasi-aset`, `disposisi-aset`, `laba-rugi-per-pusat-biaya` (pola: `src/app/(dashboard)/laporan/*/[[...segments]]/page.tsx`). Sisanya (± 27 halaman laporan + `laporan/_components/subledger-report.tsx:242`) memakai jalur `window.print()`.
- `src/components/ui/print-button.tsx:50` masih menyimpan fallback `window.print()` (saat ini 17 pemanggilnya selalu mengirim `documentType`+`documentId`, jadi belum terpakai).
- Perbaikan: sediakan `pdfHref` untuk semua laporan, atau hapus jalur `window.print()`.

### D4. [sedang] Cetak dari dark mode tidak dipaksa hitam-di-atas-putih

- `src/app/globals.css:279` menetapkan `color-scheme: dark` untuk `html.dark`, dan **tidak ada** `color-scheme: light` di blok `@media print` mana pun (`globals.css:2459/2624/2797/2811`, `print.css`).
- `src/app/print.css:13-14` hanya memaksa `body { background: white; color: black }`; deklarasi warna pada elemen anak (`text-foreground` = `#f1f5f9` di dark) tidak tertimpa → halaman non-dokumen berpotensi tercetak nyaris putih di atas kertas putih. Lembar laporan/dokumen (`.report-sheet`, `--doc-*`) sudah benar dipaksa hitam-putih.
- Perbaikan: `@media print { :root, html.dark { color-scheme: light } }` + reset warna teks global untuk halaman non-dokumen.

### D5. [sedang] Form modul `pengaturan`: tanpa penjaga pending, dan error validasi mengambil alih seluruh halaman

- `<form action={...}>` + `<Button type="submit">` tanpa `useTransition`/`useFormStatus` (grep `useFormStatus`/`useActionState` = 0 hasil di repo): `pengaturan/peran/tambah/page.tsx:42,79`, `pengaturan/peran/[slug]/ubah/page.tsx:103`, `pengaturan/peran/page.tsx:82`, `pengaturan/peran/[slug]/modul/_components/permission-matrix.tsx:60,86`, `pengaturan/persetujuan/[slug]/page.tsx:185,192`.
- Action-nya **melempar** `Error` pada validasi (`src/actions/roles.actions.ts:47,53,59,90,103,110,115,154,158,162`), sehingga (a) klik ganda bisa mengirim aksi dua kali (buat/hapus peran, langkah approval), dan (b) satu kesalahan validasi mengganti halaman dengan error boundary generik dan **input user hilang**, bukan pesan inline/toast.
- Perbaikan: bungkus dalam `useTransition` + `isDisabled={isPending}` (pola yang sudah dipakai semua `src/components/forms/*`).

### D6. [sedang] Nilai enum/kunci internal tampil mentah ke user

Helper label sudah ada (`statusLabel` di `src/lib/utils/status-labels.ts`, `StatusChip`) tetapi tidak dipakai di lokasi berikut:

- `src/app/(dashboard)/pengaturan/cron/_components/cron-task-list.tsx:121` — `{log.status}` mentah, padahal **baris 63 di komponen yang sama** sudah menerjemahkan ("Sukses"/"Gagal").
- `src/app/(dashboard)/pembelian/tagihan/[slug]/page.tsx:66` — `{bill.status}` ("draft"/"paid").
- `src/app/(dashboard)/penjualan/surat-jalan/[slug]/page.tsx:66` — `{deliveryOrder.status}`.
- `src/app/(dashboard)/master/karyawan/[slug]/page.tsx:199` — `{lr.type}` ("annual").
- `src/app/(dashboard)/aset/[slug]/page.tsx:106` — `{h.type}` ("depreciation"/"disposal").
- `src/app/(dashboard)/crm/leads/[slug]/page.tsx:117,120` — `{activity.type}`, `oldStatus → newStatus`.
- `src/app/(dashboard)/laporan/laba-rugi-proyek/[[...segments]]/page.tsx:132` — `{row.status}`.
- `src/app/(dashboard)/produksi/qc/inspeksi/[slug]/page.tsx:144` — `{n.severity}` ("minor"/"major").

### D7. [sedang] Matriks izin menampilkan verba Inggris + kunci izin mentah

- `src/app/(dashboard)/pengaturan/peran/[slug]/modul/_components/permission-matrix.tsx:130` — header kolom `{verb}`; **terbukti di layar**: `ENTITAS | VIEW | CREATE | EDIT | DELETE | MANAGE` (seharusnya "Lihat/Tambah/Ubah/Hapus/Kelola").
- `:155` — `{row.resource}` (identifier entitas mentah), `:180` — `title={cell.permissionKey}`; **terbukti di layar**: tooltip `view_dashboard`, `view_accounts`, `create_accounts`.
- `permissionGroupLabel()`/`permissionLabel()` sudah tersedia dan dipakai di `pengaturan/peran/tambah/page.tsx:64` serta `peran/[slug]/page.tsx:87` — jadi ini drift di satu halaman.

### D8. [sedang] Tanggal ISO mentah di kartu Preferensi

- `src/app/(dashboard)/pengaturan/preferensi/page.tsx:64` — `settings.periodLockDate.toISOString().split("T")[0]` menampilkan `2026-06-30` alih-alih `formatDate()` (dipakai halaman lain).

### D9. [sedang] Cetak/kirim ke pelanggan: judul & label Inggris pada PDF Penawaran

- `src/lib/pdf/generator.ts:521` — `doc.text("QUOTATION", …)`; `:685` — `doc.text("NOTE :", …)`; `:434` — `toLocaleDateString("en-GB", …)` (bulan disingkat Inggris: "15-May-24"). Rute cetak sudah menyediakan `title: "PENAWARAN HARGA"` (`src/app/api/print/route.ts:201`) tetapi tidak dipakai di jalur ini.

### D10. [sedang] Aksesibilitas: kontrol tanpa nama, aksi `role="option"`-safe tetapi tombol ikon tanpa label

- Input baris form hanya bermodal `placeholder` (tanpa `aria-label`/`<label>`): `src/components/forms/purchase-order-form.tsx` (**0 kemunculan `aria-label`** di seluruh berkas, qty/diskon/harga/deskripsi), `work-order-form.tsx:279-295`, `stock-adjustment-form.tsx:277-312`, `journal-form.tsx:121-124`, `quotation-form.tsx:304-399`, `purchase-request-form.tsx:293-313`, `goods-receipt-form.tsx:723,757`, `sales-return-form.tsx:162`, `payment-form.tsx:169,291`, `item-form.tsx:594,607`. Pola yang sudah benar: `material-issue-form.tsx:216`.
- Tombol ikon tanpa nama: `pengaturan/log-aktivitas/_components/activity-log-table.tsx:262-269` (satu-satunya tombol "lihat rincian perubahan", `h-7 w-7`), `purchase-request-form.tsx:317-323`, `vendor-bill-form.tsx:458-464`, dan tombol `×` hapus baris di `quotation-form.tsx:405`, `work-order-form.tsx:316`, `purchase-order-form.tsx:583`, `purchase-return-form.tsx:144`, `stock-adjustment-form.tsx:318`, `journal-form.tsx:124`.
- Aksi mouse-only pada elemen non-interaktif: `src/components/forms/profile-form.tsx:90` (div pemicu unggah avatar), `src/components/layout/notification-dropdown.tsx:119-120` ("tandai dibaca").
- Grup pilihan tanpa `role=radiogroup`/`aria-pressed`: `pengaturan/penyimpanan/ubah/_components/storage-form.tsx:72-88`, `src/components/dashboard/charts.tsx:418-460`.
- Bersih: tidak ada pelanggaran WCAG 2.5.3 (label-in-name); `combobox.tsx` sudah menaruh aksi "Tambah baru…" sebagai `button` di luar listbox; semua Dialog/Sheet punya title; `<img>` punya `alt`; `data-table.tsx` sudah punya `aria-sort`/sr-only pagination.

### D11. [sedang] Tabel item form tanpa wrapper `overflow-x-auto` → halaman melebar di ponsel

- `src/components/forms/purchase-order-form.tsx:512`, `journal-form.tsx:101`, `purchase-return-form.tsx:112`, `sales-return-form.tsx:136`, `down-payment-form.tsx:190` (kolom ber-`width` kaku, tanpa pembungkus scroll).
- Pembanding yang sudah benar: `goods-receipt-form.tsx:491`, `inventory-transfer-form.tsx:123`, `material-issue-form.tsx:177`, `item-form.tsx:577`, `work-order-form.tsx:220`, `stock-adjustment-form.tsx:222`, `purchase-request-form.tsx:254`, `vendor-bill-form.tsx:331`.

### D12. [sedang] Modal "PO Jasa" tidak bisa di-scroll di layar kecil

- `src/app/(dashboard)/produksi/perintah-kerja/[slug]/_components/create-service-po-button.tsx:75-76` — overlay `fixed inset-0` tanpa `overflow-y-auto`, panel `max-w-lg` tanpa `max-h`; daftar item panjang membuat tombol "Buat PO Jasa"/"Batal" tak terjangkau.

### D13. [sedang] Dropdown notifikasi terpotong di layar kecil

- `src/components/layout/notification-dropdown.tsx:97` — `w-80` (320px) + `right-0` terhadap tombol lonceng yang tidak berada di tepi layar → di ≤360px sisi kiri keluar viewport.

### D14. [sedang] Target sentuh < 44px

- `pengaturan/log-aktivitas/_components/activity-log-table.tsx:265` (28px, tombol mata; muncul juga di kartu mobile), `src/components/ui/data-table.tsx:579,589,599,609` (32px navigasi), `src/components/dashboard/recent-invoices-table.tsx:418,428` (28px), `src/components/ui/search-field.tsx:66` (28px). Media query "touch-friendly" di `globals.css:1604` hanya menyasar kelas legacy `.btn`/`.nav-item`.

### D15. [sedang] Ekspor PDF/CSV tanpa indikator proses

- `src/components/reports/export-buttons.tsx:313-334` — `handleExportPDF` (`:122`) membangun tabel + jsPDF di main thread tanpa state pending/`disabled`; dipakai di ~35 halaman, mayoritas lewat jalur client-side ini. Bandingkan `print-button.tsx` yang sudah benar (`isPrinting` + label "Mencetak...").

### D16. [rendah–sedang] Kegagalan yang disamarkan

- `src/components/ui/transaction-attachments.tsx:60-63` — `catch { /* silently fail */ }` → API gagal ditampilkan sebagai "Belum ada lampiran bukti" (false-empty).
- `src/components/ui/form-attachment-upload.tsx:86` — `fetch(DELETE).catch(() => {})` → item hilang dari UI walau server gagal (file yatim).
- `src/components/layout/notification-dropdown.tsx:59-63` — `markAsRead` tanpa cek `res.ok`/try-catch → badge "belum dibaca" bisa drift dari server.

### D17. [rendah] Halaman error fatal selalu terang

- `src/app/global-error.tsx:19-30` — `bg-gray-50`, `bg-white`, `text-gray-900`, `text-gray-500` hardcoded (tanpa token/`dark:`) sehingga terasa "keluar tema" saat dark mode.

### D18. [rendah] Teks Inggris yang dibaca user/screen reader

- `src/components/ui/shadcn/sheet.tsx:80` — `<span className="sr-only">Close</span>`.
- `src/components/reports/export-buttons.tsx:310` — `aria-label="Export dokumen"` pada grup tombol (istilah lain di app: "Unduh"/"Cetak"/"Ekspor").

### D19. [rendah] Format angka & pemotongan teks

- `src/components/ui/shadcn/chart.tsx:258` — `item.value.toLocaleString()` tanpa locale → tooltip chart memakai format en-US (koma ribuan); dipakai `SalesStatusChart`/`ProjectPipelineChart`.
- `truncate` tanpa `title`/tooltip: `activity-log-table.tsx:185` (nama pengguna, jadi baris utama di kartu mobile), `:241`, `app/(dashboard)/page.tsx:380,383,527`, `dashboard/workshop-dashboard.tsx:187,190`, `dashboard/purchase-dashboard.tsx:132`, `laporan/mutasi-stok/[[...segments]]/page.tsx:138`. Pola yang sudah benar: `recent-invoices-table.tsx:149`.

### D20. [rendah] Baris filter tanpa `flex-wrap`

- `src/app/(dashboard)/master/barang/page.tsx:97` (`min-w-[180px]`), `src/app/(dashboard)/sdm/penggajian/page.tsx:171,186` (`min-w-[140px]`+`min-w-[110px]`) — total lebih lebar dari konten di 360px sehingga tombol Filter tergeser.

### D21. [rendah] Fallback warna hardcoded

- `src/app/(dashboard)/proyek/[slug]/page.tsx:192` — `backgroundColor: project.customerVehicle.color || "#000"` → titik hitam tak terlihat di kartu gelap (dark mode).

### D22. [rendah–sedang] Laporan multi-periode saat dicetak

- `src/app/(dashboard)/laporan/multi-periode/[[...segments]]/page.tsx:224` — tabel `min-w-[720px]` dengan jumlah kolom periode dinamis; di layar aman (`overflow-x-auto`), tetapi saat dicetak ke A4 landscape berpotensi melebihi lebar kertas. **Belum terbukti** (butuh cetak nyata).

## Status perbaikan

Bukti gerbang: `tsc --noEmit` bersih · `npm test` 260 berkas / 3539 test lulus (3 guard baru) · ESLint 0 error.
Semua perubahan diverifikasi ulang di browser (dark mode + cetak) lewat Chrome headless.

| Temuan | Status | Yang berubah |
| --- | --- | --- |
| D1, D2 | **Selesai** | Token baru `--success-foreground`/`--warning-foreground` (`globals.css`); `text-white` di atas token terang diganti `text-{success,warning,primary}-foreground` di `project-stages.tsx`, `approve-button.tsx`, `persetujuan/[slug]`, `faktur/[slug]`, `confirm-dialog.tsx`, `button.tsx`; chip chart pakai `text-background`. Diukur ulang di dark: `bg-success`+`text-success-foreground` = 9.2:1, `bg-primary`+`text-primary-foreground` = 17.2:1. Guard: `dark-mode-token-contrast.test.ts` |
| D3 | **Sebagian** | Sisa jalur `window.print()` di `PrintButton` dihapus + `documentType`/`documentId` kini WAJIB di tipe. Laporan yang belum punya entri registry PDF (± 20 laporan) **masih** mencetak HTML — butuh entri `REPORTS` baru per laporan (lihat catatan di bawah) |
| D4 | **Selesai** | `print.css`: `html.dark { color-scheme: light }` + teks dipaksa hitam saat cetak dari dark. Diverifikasi: cetak dari dark → `color-scheme: light`, teks `rgb(0,0,0)`, kertas putih; cetak dari terang tidak berubah |
| D5 | **Selesai** | `SubmitButton` (useFormStatus) + `ActionForm` (useActionState + error inline); `createRole`/`updateRole` mengembalikan `{success:false,error}` (bukan melempar) sehingga isian form tidak hilang; baris hapus peran memakai `DeleteButton`. Guard: `server-action-form-pending.test.ts`. `deleteRole` tetap melempar karena dipanggil komponen klien yang sudah menampilkan toast |
| D6 | **Selesai** | Peta label kanonik di `status-labels.ts` (`LEAVE_TYPE_LABELS`, `ASSET_HISTORY_TYPE_LABELS`, `LEAD_ACTIVITY_TYPE_LABELS`, `SEVERITY_LABELS`, helper `labelFrom`) + 8 lokasi memakainya; opsi form cuti & aktivitas prospek kini dari peta yang sama. Guard: `status-labels.test.ts` |
| D7 | **Selesai** | Header matriks izin pakai `permissionGroupLabel`, tooltip `permissionLabel`, placeholder pencarian tidak lagi menampilkan key mentah |
| D8, D18–D21 | **Selesai** | Tanggal pakai `formatDate`; sr-only "Close"→"Tutup"; `aria-label="Ekspor dokumen"`; chart `toLocaleString("id-ID")`; `flex-wrap` pada 2 form filter; fallback warna `var(--muted-foreground)` |
| D17 | **Belum** | `global-error.tsx` masih `bg-gray-50`/`bg-white`/`text-gray-900` (halaman ini merender `<html>` sendiri tanpa kelas tema, jadi perlu keputusan gaya terpisah) |
| D10 (sebagian) | **Sebagian** | Tombol ikon & tombol hapus baris (11 lokasi) punya `aria-label`; `profile-form` & baris notifikasi jadi kontrol keyboard; `storage-form` `role=radiogroup/radio`; pill chart `aria-pressed`. **Belum**: `aria-label` untuk input baris di 6 form (work-order, stock-adjustment, purchase-order, journal, quotation, purchase-request) |
| D11–D14, D15, D16 | **Selesai** | 5 tabel item form dibungkus `overflow-x-auto`; modal PO Jasa `max-h-[90dvh] overflow-y-auto`; dropdown notifikasi `w-[min(20rem,calc(100vw-2rem))]`; target sentuh pagination/tombol baris → `size-10`; ekspor PDF/CSV punya status pending + anti klik-ganda; lampiran gagal muat/hapus tidak lagi tampil sebagai "kosong" |
| D22 | **Belum** | Butuh cetak nyata untuk membuktikan overflow A4 landscape laporan multi-periode |

### Yang masih terbuka (jujur)

1. **D3 sisa**: ± 20 laporan (`buku-besar`, `arus-kas`, `mutasi-stok`, `analisis-penjualan`, `pajak`, `valuasi-stok`, `kartu-stok`, `multi-periode`, `perbandingan-periode`, `bukti-potong-pph`, `piutang-pelanggan`, `hutang-jatuh-tempo`, `total-hutang`, `proyeksi-kas`, `pusat-laba`, `serapan-overhead`, `rekonsiliasi-ppn`, `rekonsiliasi-stok`, `ringkasan-ar-ap`, `ringkasan-stok`, `umur-stok`, `laba-rugi-proyek`, `analisis-harga-beli`) belum punya entri di `REPORTS` (`report-registry.ts`), jadi tombol Cetak-nya masih mencetak halaman aplikasi. Menambahkannya = 1 entri (judul + `load()` yang membangun tabel) + test per laporan.
2. **D10 sisa**: `aria-label` per kolom untuk input baris di 6 form item.
3. **D16 sisa**: `notification-dropdown` memuat daftar tanpa penanganan galat (`catch { // silent }` pada pemuatan daftar — bukan pada `markAsRead` yang sudah diperbaiki).
4. **D14 sisa**: tombol bersihkan di `search-field.tsx` masih 28px (memperbesar akan menabrak padding input).
5. **D22**: belum diuji cetak nyata.
6. Temuan `confirm()` bawaan di `master/kategori-pengeluaran/[slug]/ubah/form.tsx:21` belum diganti `ConfirmDialog`.

## Yang saya batalkan / koreksi atas pengukuran saya sendiri

1. **Klaim awal saya salah**: pengukuran pertama saya menyebut tautan aksi tabel "Detail/Ubah" tak terbaca (kontras 1.04–1.1) di `pengaturan/peran`. Itu **artefak**: saya mengukur `getComputedStyle` tepat setelah mengganti kelas tema, sementara elemennya memakai `transition-colors`, jadi yang terbaca adalah nilai *di tengah animasi*. Setelah jeda 1.2s dan memakai mekanisme tema asli, kontrasnya 17.85:1 (normal). Tidak ada bug di sana.
2. **404 `/pengaturan/peran/<slug>/ubah` dan `/<slug>/modul`** (termasuk slug & id valid) **bukan bug aplikasi**: file ada di container, `/api/auth/csrf` tetap 200, dan setelah `docker compose restart app` kedua halaman render normal ("Ubah Peran: admin", "Izin — Admin"). Ini manifest rute dev yang basi (lihat AGENTS.md).
3. Dua error di browser console — `Failed to execute 'measure' on 'Performance': 'VehicleModelsRedirect'/'LegacyFinanceReportPage' cannot have a negative time stamp` — muncul pada halaman yang **hanya** berisi `redirect()` (`kendaraan/model/page.tsx`, `laporan/keuangan/page.tsx`). Dugaan kuat: artefak instrumentasi dev Next.js, bukan logika aplikasi. **Butuh konfirmasi di build produksi sebelum dianggap bug.**
4. `ERR_EMPTY_RESPONSE` pada `master/syarat-pembayaran/tambah` terjadi karena container dev restart di tengah sweep milik saya, bukan karena halaman itu.

## Catatan operasional (bukan temuan aplikasi)

Sweep browser saya (205 rute, kompilasi on-demand Turbopack) membuat container dev keluar dengan kode 0 lalu `restart: unless-stopped` menghidupkannya kembali (pola yang sudah terdokumentasi di AGENTS.md). Setelah itu saya kurangi cakupan (45 rute berjeda) dan selesai tanpa masalah. Cache `.next-dev` naik dari 15,8 GB ke 18,1 GB (30% dari 62,7 GB) — tidak perlu dibersihkan.

## Area yang diperiksa dan BERSIH

- **Guard invarian**: 35 test lulus (lihat tabel metode).
- **Sweep runtime 102 rute**: tidak ada error kompilasi/runtime, tidak ada overflow horizontal di 390px, tidak ada teks `undefined`/`NaN`/`[object Object]`, tidak ada permukaan yang tetap putih di dark mode.
- **Token tema**: `globals.css` tidak memakai hex hardcoded di komponen (grep `#rrggbb`/`rgb()`/`hsl()`/`bg-[#…]` di `.tsx` hanya menghasilkan temuan D17/D21). Kelas palette Tailwind (`text-slate-*` dll.) hanya 11 kemunculan di 5 berkas.
- **Lembar laporan/dokumen**: `report-sheet.tsx`, `report-letterhead.tsx`, `.doc-*`/`.stmt` memakai token `--doc-*`, ikut dark mode di layar, dan dipaksa hitam-putih saat `@media print`. Engine PDF (`src/lib/pdf/engine|documents`) memang black-on-white.
- **Boundary loading/error**: boundary bersama `(dashboard)/loading.tsx` + `(dashboard)/error.tsx` + `app/error.tsx`/`global-error.tsx` menutup semua segmen; tidak ada segmen tanpa perlindungan.
- **Form di `src/components/forms/*` (53 berkas)**: submit dijaga `isDisabled={isPending}`, ada toast sukses/gagal, error field dirender, redirect/refresh setelah sukses.
- **DataTable**: empty state, pagination, total, kartu mobile (`md:hidden`) — 74 list page konsisten; `detail-table.tsx` membungkus tabel dengan `overflow-x-auto` (85 berkas).
- **Primitif dialog/drawer/combobox shadcn**: lebar sudah `max-w-[calc(100%-2rem)]`, `max-h-[90dvh]` + area scroll, `w-(--radix-popover-trigger-width)`.
- **Lebar kolom cetak**: semua ≤ 180mm portrait / ≤ 267mm landscape (asset-register 263mm, asset-movement 267mm, trial-balance 180mm).
- **Navigasi/menu/command palette/notifikasi/dashboard/status-chip**: seluruh teks Indonesia, tanggal & uang format `id-ID`.
- **Konfirmasi destruktif**: `delete-button`, `void-button`, `qc-checklist-actions`, `clear-log-button` memakai `ConfirmDialog`; hanya satu `confirm()` native (D-item `kategori-pengeluaran/[slug]/ubah/form.tsx:21`, lihat D10/kategori di bawah).

> Temuan tambahan yang terverifikasi: `src/app/(dashboard)/master/kategori-pengeluaran/[slug]/ubah/form.tsx:21` memakai `confirm(...)` bawaan browser (bukan `AlertDialog`), padahal seluruh aplikasi memakai `ConfirmDialog`.

## Batasan (yang TIDAK tercakup audit ini)

- **DB dev hampir kosong** (0 item, 0 proyek, 0 dokumen penjualan/pembelian/produksi, 1 pengguna). Karena itu halaman **detail dokumen** dan laporan berdata tidak diuji runtime; temuan yang menyangkut halaman tersebut (D6, D8, D12, D22) diverifikasi lewat kode, bukan lewat data nyata.
- 148 rute tidak selesai pada sweep pertama (crash container); 45 di antaranya diuji pada sweep kedua → total **102 dari ±205 rute** statis. Rute ber-segmen dinamis (`[slug]`, `[vehicleSlug]`, dst.) tidak diuji runtime sama sekali.
- Dark mode diuji via pengukuran token/kontras pada halaman yang bisa dibuka, bukan tangkapan layar tiap halaman.
- Perilaku cetak fisik (dialog cetak, hasil kertas) tidak dijalankan — D3/D4/D22 disimpulkan dari CSS dan jalur kode.
- Audit tidak menyentuh `src/components/ui/shadcn/**` secara menyeluruh (diasumsikan primitif vendored sudah benar), kecuali `sheet.tsx` dan `chart.tsx` di atas.
