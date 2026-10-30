# ROUND 6 — Audit Approval Workflow Engine + Notifikasi

Tanggal: 2026-10-30. Read-only; tidak ada file produksi diubah.

Cakupan dicari: `src/lib/services/approval-workflow.service.ts` dan pemanggilnya, maker-checker,
`requestApprovalIfConfigured`/`assertApproved`, `src/lib/services/notification.service.ts`, kanal
email/Telegram/WhatsApp, antrean/retry notifikasi, deep-link notifikasi, skip langkah approval,
maker==checker via bulk/API/import, notifikasi gagal senyap, penerima salah scope, badge salah,
dedupe/idempotency hilang.

Anti-duplikat: tidak mengulang temuan round 2/3/4/5 (`BUGHUNT-*.md`, `ROUND5-*.md`), termasuk
STOK-06 — approval StockAdjustment gate-only di `src/actions/approval.actions.ts:41` sudah benar.
Kandidat edit-sesudah-approval di bawah berbeda: approval lama bertahan sesudah isi dokumen berubah,
sedangkan gerbang bawah tetap percaya approval lama.

Ringkasan: 11 temuan — HIGH 2, MEDIUM 7, LOW 2. Tidak ditemukan kanal email/Telegram/WhatsApp
transaksional, antrean notifikasi, retry terjadwal, delivery log, atau deep-link terstruktur.

---

## R6WN-01 — HIGH · CONFIRMED — Isi Journal, VendorPayment, StockAdjustment, dan SalesInvoice bisa berubah sesudah approval final; gerbang bawah tetap memakai approval lama

- Lokasi inti: `src/lib/services/approval-workflow.service.ts:45-49`, `:58-65`.
- Bukti: approval hanya terikat ke `(referenceType, referenceId)`. Bila approval terakhir berstatus
  `approved`, `requestApprovalIfConfigured` return `false` tanpa approval baru; `assertApproved` langsung
  lolos tanpa cek versi, nominal, hash isi, tanggal revisi, atau status-edit dokumen.
- Journal: approval final gate-only sehingga status tetap `DRAFT`; `updateJournal` hanya menolak non-DRAFT
  (`src/actions/finance.actions.ts:2134-2137`), mengganti header dan seluruh entries (`:2186-2201`),
  lalu memanggil request lama (`:2212`). `postJournal` lolos lewat approval lama (`:630`).
- VendorPayment: approval final gate-only sehingga status tetap `draft`; `updateVendorPayment` mengganti
  vendor, amount, tanggal, akun, bill, dan metode (`src/actions/purchase.actions.ts:3634-3649`), lalu
  memanggil request lama (`:3672`). `confirmVendorPayment` lolos lewat approval lama (`:2117`).
- StockAdjustment: approval final gate-only sehingga status tetap `draft`; `updateStockAdjustment`
  mengganti gudang, tanggal, reason, type, dan seluruh item (`src/actions/inventory.actions.ts:2077-2104`),
  tanpa request approval baru. `processStockAdjustment` lolos lewat approval lama
  (`src/actions/inventory.actions.ts:380`).
- SalesInvoice: `updateSalesInvoice` eksplisit boleh mengedit `draft` dan `approved`, mengganti
  customer dan seluruh item/total (`src/actions/sales.actions.ts:3214-3301`), tanpa request approval baru.
  `postInvoice` lolos lewat approval lama (`src/actions/sales.actions.ts:1192`).
- Skenario gagal: finance membuat pembayaran vendor Rp10 juta; approver menyetujui; maker mengedit
  menjadi Rp900 juta atau mengganti vendor; maker atau user berizin konfirmasi menjalankan confirm;
  jurnal dan alokasi memakai nilai baru yang tidak pernah disetujui. Pola sama berlaku untuk jurnal
  manual, qty/unit-cost penyesuaian stok, dan item/total faktur penjualan.
- Ini bukan STOK-06. STOK-06 menutup status `approved` yang mengunci proses StockAdjustment. Celah ini
  adalah stale approval sesudah dokumen gate-only tetap bisa diedit.

## R6WN-02 — HIGH · CONFIRMED — Approval generik menulis status `approved` ke Asset dan Project yang lahir berstatus operasional `active`

- Lokasi: `src/actions/approval.actions.ts:304-368`; daftar gate-only hanya Journal, VendorPayment,
  StockAdjustment (`:41`).
- Bukti: pada langkah final, semua tipe non-gate-only tanpa claim khusus ditulis
  `status: "approved"` lewat `docModel.update`. Asset lahir dari `status: data.status || "active"`
  (`src/actions/asset.actions.ts:843`), dan approval diminta saat create (`:900`). Project lahir
  `status: "active"` (`src/actions/project.actions.ts:56`), dan approval diminta saat create (`:65`).
- Dampak terverifikasi: cron depresiasi hanya memproses Asset `status: "active"`
  (`src/app/api/cron/asset-depreciation/route.ts:64`). Project status helper hanya mengenali alur
  `active`/`in_progress`/`completed` (`src/lib/services/project-status.ts:36-74`); `approved` tidak dipulihkan
  ke status operasional oleh approval engine.
- Skenario gagal: admin mengaktifkan workflow Asset; aset baru disetujui final untuk membuka gerbang
  disposal; status aset berubah `active -> approved`; cron depresiasi berikutnya melewati aset itu
  selamanya sampai status diperbaiki manual. Pada Project, approval final dapat mengganti `active`
  dengan `approved`, memutus asumsi sinkronisasi stage/WO yang mengharapkan kosakata operasional.
- VendorBill punya pola buntu terkait, tetapi tidak dihitung terpisah sebagai HIGH: create/confirm tidak
  meminta atau mengecek workflow (`src/actions/purchase.actions.ts:1501`, `:1828-1838`), sedangkan
  approval generik bila barisnya dibuat lewat route status dapat menulis `approved`; confirm hanya
  menerima `draft` (`:1836-1838`).

## R6WN-03 — MEDIUM · CONFIRMED — Tidak ada notifikasi approval ke approver langkah berjalan; approval bisa macet tanpa penerima spesifik

- Lokasi: `src/lib/services/approval-workflow.service.ts:10-56`;
  `src/actions/approval.actions.ts:214-417`, `:419-535`, `:544-605`.
- Bukti: file approval tidak memanggil `notificationService` sama sekali. `create`, advance step,
  final approve, reject, dan reopen hanya menulis Approval/ApprovalHistory, activity log, dan revalidate.
  Skema `Notification` juga tidak punya reference type/id atau URL terstruktur
  (`prisma/schema.prisma:397-411`).
- Bukti penerima: `notifyAdmins` hanya mengirim ke role `super_admin`/`admin` aktif
  (`src/lib/services/notification.service.ts:46-66`). Tidak ada resolver penerima dari
  `ApprovalWorkflowStep.userId` atau `roleId`.
- Skenario gagal: workflow dua langkah menetapkan user Finance A pada langkah 1 dan user Finance B
  pada langkah 2. Dokumen dibuat atau langkah 1 selesai; B tidak menerima notifikasi apa pun.
  B hanya tahu bila membuka antrean persetujuan secara manual. Dashboard hanya memberi
  `pendingApprovalCount` global ke super admin/pemegang `approve_workflows`/`manage_settings`
  (`src/app/api/dashboard/notifications/route.ts:34-37`, `:68-70`), bukan tugas tertarget ke B.
- Akibat: tidak ada jejak pengiriman gagal karena pengiriman memang tidak pernah dicoba. Activity log
  mencatat aksi sebelumnya, tetapi tidak memberi alert tertarget ke approver berikutnya.

## R6WN-04 — MEDIUM · CONFIRMED — `reopenApproval` melaporkan sukses walau approval baru tidak lahir

- Lokasi: `src/actions/approval.actions.ts:544-605`, terutama `:580-582` dan `:599`.
- Bukti: dokumen `rejected -> draft` dilakukan lebih dulu (`:572-577`), lalu
  `requestApprovalIfConfigured(...)` dipanggil. Nilai boolean hasilnya dibuang. Fungsi selalu return
  `{ success: true }` setelah transaction (`:599`).
- Bukti service: request return `false` bila workflow sudah nonaktif/terhapus, dan juga return `false`
  bila approval terakhir bukan pending/rejected (`src/lib/services/approval-workflow.service.ts:39-49`).
- Skenario gagal: approval ditolak; sebelum dibuka ulang, admin menonaktifkan atau mengganti workflow.
  User menekan reopen; dokumen kembali `draft`; tidak ada Approval pending baru; UI menerima sukses.
  Pada tipe gate-only, `assertApproved` berikutnya tetap melihat approval terakhir `rejected` dan menolak
  proses, tetapi state UI menyatakan resubmit berhasil. Pada tipe fail-open tanpa approval, downstream
  dapat berjalan tanpa gerbang baru. Route status manual punya cek fresh pending
  (`src/app/api/workflow/[...path]/route.ts:185-193`), jalur detail generik tidak.

## R6WN-05 — MEDIUM · CONFIRMED — Mengganti `modelType` workflow Journal/VendorPayment tetap aktif dapat mematikan gerbang uang tanpa log gerbang uang dan tanpa konfirmasi money-gate

- Lokasi: `src/actions/approval.actions.ts:662-733`; form juga hanya memicu konfirmasi bila saklar
  aktif dimatikan (`src/app/(dashboard)/pengaturan/workflow/_components/workflow-form.tsx:161-167`).
- Bukti: update menulis `modelType` baru dan `isActive: isActive !== false` (`approval.actions.ts:698-716`).
  `logMoneyGateChange` hanya dipanggil bila workflow sebelumnya aktif dan payload `isActive === false`
  (`:726-733`). Jalur delete mencatat gerbang uang, jalur ganti modelType tidak.
- Bukti pemilihan workflow: request approval memilih workflow aktif berdasarkan `model_type` persis
  (`src/lib/services/approval-workflow.service.ts:33-38`). Tidak ada workflow Journal/VendorPayment aktif
  sesudah modelType diganti berarti request menjadi no-op dan `assertApproved` tanpa baris baru tetap
  fail-open untuk dokumen baru.
- Skenario gagal: pemegang `manage_settings` mengubah workflow “Persetujuan Jurnal Manual” dari
  `Journal` ke `Expense` sambil tetap aktif. Guard pending hanya memblokir bila approval pending memakai
  workflow ID itu; jurnal baru sesudahnya tidak lagi dimintai approval. Log khusus gerbang uang tidak
  lahir, dan UI tidak meminta konfirmasi money-gate karena saklar tetap aktif.

## R6WN-06 — MEDIUM · CONFIRMED — Tipe workflow UI, tipe backend, dan permission approval tidak sinkron; beberapa approval hanya bisa diproses super admin/pemegang `approve_workflows`

- Lokasi: `src/lib/constants/approval.ts:2`; `src/lib/auth/approval-permissions.ts:16-29`;
  `src/lib/validations/approval.schemas.ts:19-32`;
  `src/app/(dashboard)/pengaturan/persetujuan/page.tsx:29`;
  `src/app/(dashboard)/pengaturan/persetujuan/[slug]/page.tsx:33`.
- Bukti backend memakai tipe di luar opsi UI: Quotation diminta dari
  `src/actions/sales.actions.ts:359`, StockAdjustment dari `src/actions/inventory.actions.ts:347`,
  dan YearEndClosing dari `src/lib/services/year-end-closing.service.ts:58-60`. Ketiganya tidak ada di
  `APPROVAL_MODEL_TYPES`, sedangkan form membangun opsi hanya dari konstanta itu
  (`workflow-form.tsx:93`). VendorBill ada di permission map, tetapi create/confirm tidak meminta atau
  mengecek approval; jalur hidupnya hanya route status generik.
- Bukti permission: `APPROVAL_REFERENCE_PERMISSIONS` tidak memuat Payroll, StockAdjustment, Project,
  Asset, YearEndClosing. `assertApprovalPermission` hanya menerima permission referensi itu atau
  `approve_workflows`, selain bypass super admin (`approval.actions.ts:124-137`).
- Bukti UI antrean/detail selalu mewajibkan `approve_workflows`. Approver domain yang sah lewat
  tombol dokumen tidak bisa membuka antrean/detail generik.
- Skenario gagal: admin UI tidak dapat membuat workflow Quotation/StockAdjustment/YearEndClosing dari
  daftar tipe walau backend dan seed/konfigurasi manual dapat memakainya. Sebaliknya, schema server
  menerima `modelType` string bebas (`approval.schemas.ts:21`, `:29`), sehingga workflow typo seperti
  `journal` lahir aktif tetapi tidak pernah cocok dengan `Journal` pada service. Untuk StockAdjustment
  dan YearEndClosing, approver operasional tanpa `approve_workflows` juga tidak dapat memproses
  approval dari antrean walau merekalah pemilik proses bisnisnya.

## R6WN-07 — MEDIUM · CONFIRMED — Langkah workflow hanya berisi nama atau `approverType` bebas dianggap langkah sah, tetapi tidak menunjuk approver mana pun

- Lokasi: `src/lib/validations/approval.schemas.ts:42-55`;
  `src/actions/approval.actions.ts:618-625`, `:672-679`, `:179-212`;
  `src/app/(dashboard)/pengaturan/workflow/_components/workflow-form.tsx:146-152`, `:305-312`.
- Bukti: filter langkah menghitung `name` saja sebagai sinyal cukup. UI juga hanya mengirim langkah
  bila ada role/`approverType`/nama; `approverType` adalah teks bebas “mis. manager”. Form UI bahkan
  tidak mengirim `userId` pada payload (`workflow-form.tsx:147-151`).
- Bukti enforcement: `assertStepApprover` hanya memeriksa `userId` atau `roleId`. Bila keduanya null,
  fungsi selesai tanpa batas approver langkah (`approval.actions.ts:196-212`). Permission referensi atau
  `approve_workflows` menjadi satu-satunya gerbang.
- Skenario gagal: admin membuat langkah “Persetujuan Manager” hanya dengan nama atau mengisi
  `approverType = manager`. Tidak ada user/role bernama itu yang ditegakkan. User mana pun yang punya
  `approve_workflows` atau permission dokumen terkait dapat menyetujui langkah tersebut, walau UI dan
  detail approval menampilkan label approver seolah spesifik. Bila workflow hanya satu langkah, itu
  menjadi approval final.

## R6WN-08 — MEDIUM · CONFIRMED — Badge lonceng selalu mulai 0 dan tidak mengambil unread count sampai dropdown dibuka

- Lokasi: `src/components/layout/notification-dropdown.tsx:19-24`, `:37-63`, `:98-105`.
- Bukti: `unreadCount` state awal `0`; `fetchNotifications` hanya dipanggil dari `handleToggle` saat
  dropdown dibuka. Tidak ada fetch saat mount, interval, focus refresh, atau server-provided initial count.
  API sendiri sudah mengembalikan unread count global user (`src/app/api/notifications/route.ts:16-34`).
- Skenario gagal: user login dengan 25 notifikasi belum dibaca. Header tidak menampilkan dot badge.
  User tidak punya alasan membuka lonceng, sehingga notifikasi operasional tidak terlihat sampai ia
  membuka dropdown karena alasan lain. Sesudah dibuka pun dropdown hanya menampilkan lima pertama
  (`notification-dropdown.tsx:134`) walau API mengambil sepuluh.
- Dampak lanjutan: `now` dibekukan pada mount (`:24`), jadi label “x menit lalu” tidak menua selama
  komponen hidup.

## R6WN-09 — MEDIUM · CONFIRMED — Dedupe cron harian berbasis judul + “recipient mana pun” menahan penerima baru; cron generik tanpa dedupe dapat mengirim spam dobel bila dijadwalkan eksternal

- Lokasi: `src/lib/services/notification.service.ts:111-176`;
  `src/app/api/cron/daily-notifications/route.ts:90-122`;
  `src/app/api/cron/route.ts:183-195`, `:248-252`, `:307`;
  `vercel.json:2-14`.
- Bukti dedupe: `notifyUsersIfNew` dan batch-nya skip satu judul untuk semua recipient bila judul sama
  sudah ada untuk recipient mana pun sejak awal hari. Penerima dihitung dari daftar admin saat cron jalan.
- Skenario gagal A: cron pukul 07:00 mengirim “3 Barang Stok Menipis” ke Admin A. Admin B dibuat/aktif
  pukul 09:00; rerun atau kategori yang sama tidak mengirim ke B karena judul sudah ada untuk A.
  Sebaliknya, bila hitungan barang berubah, judul ikut berubah dan semua admin menerima notifikasi kedua
  pada hari sama.
- Bukti spam: `/api/cron` generik memanggil batch low-stock, warehouse low-stock, overdue
  `notifyAdmins`, dan late-check-in batch tanpa dedupe internal. Service batch terkait memang
  non-idempotent (`notification.service.ts:184-224`, `:231-256`, `:297-325`). `vercel.json` hanya
  menjadwalkan `/api/cron/daily-notifications`, jadi jalur generik tidak terbukti terjadwal dari repo;
  temuan spam bersifat kondisional pada scheduler eksternal atau pemanggilan manual berulang.
- Tidak ada unique dedupe key. Komentar service sendiri mengakui race dua run paralel dengan judul sama
  dapat sama-sama lolos (`notification.service.ts:104-110`).

## R6WN-10 — LOW · CONFIRMED — Halaman `/notifikasi` menghitung “belum dibaca” hanya dari 50 notifikasi terbaru dan body path tidak menjadi link

- Lokasi: `src/app/(dashboard)/notifikasi/page.tsx:15-31`, `:40-58`;
  `prisma/schema.prisma:397-411`.
- Bukti: query `take: 50`, lalu unread dihitung dari array hasil query, bukan count DB:
  `notifications.filter((n) => !n.readAt)`. API terpisah sudah punya pola count benar
  (`src/app/api/notifications/route.ts:31`).
- Skenario gagal: user punya 80 unread lama, lalu menerima 50 notifikasi baru yang sudah dibaca sebagian.
  Header halaman dapat menampilkan angka jauh lebih kecil dari unread sebenarnya, bahkan 0 bila 50 terbaru
  semuanya terbaca, padahal unread lama masih ada di luar jendela.
- Bukti link: skema tidak punya URL/reference. Body dirender sebagai teks `<p>` polos. Path yang dikirim
  pemanggil, misalnya `/penjualan/penawaran/<id>` dari `src/actions/sales.actions.ts:391`, tidak dapat
  diklik dari halaman maupun dropdown. Path-nya sendiri bukan route mati; cacatnya adalah tidak ada
  deep-link terstruktur/clickable.

## R6WN-11 — LOW · CONFIRMED — Update PurchaseOrder memberi notifikasi “baru dibuat”, tanpa try-catch dan tanpa dedupe

- Lokasi: `src/actions/purchase.actions.ts:3118-3207`, terutama `:3189-3193`.
- Bukti: `updatePurchaseOrder` mengirim judul persis sama dengan create PO,
  `"Pesanan Pembelian baru dibuat"`, sesudah transaction update commit. Berbeda dengan create PO
  (`:913-921`) dan create service PO (`:1062-1069`), update tidak membungkus notify dengan try-catch.
  `notifyAdmins` sendiri tidak dedupe (`notification.service.ts:46-66`).
- Skenario gagal: setiap edit PO draft mengirim lagi notifikasi seolah PO baru ke semua admin. Admin
  membuka notifikasi dan mengira ada PO tambahan. Bila insert notifikasi gagal sesudah PO commit,
  action jatuh ke catch luar dan melaporkan update gagal walau data PO sudah berubah; user dapat mencoba
  simpan ulang dan mengirim notifikasi tambahan bila percobaan berikutnya mencapai notify.
- Deep-link body `/pembelian/pesanan/<slug|id>` valid, tetapi tampil sebagai teks polos karena R6WN-10.

---

## Dibuang

- Double-click/concurrent approve tidak melewati langkah — approval dikunci `FOR UPDATE`, status pending dan rentang currentStep divalidasi ulang (`approval.actions.ts:235-258`).
- Maker-checker jalur utama approve dan reject ditegakkan untuk non-super-admin (`approval.actions.ts:265-268`, `:463-466`); route status manual juga menerapkan cek maker dan HR scope sebelum mutasi.
- Approval final Payroll/Leave/Overtime/EmployeeLoan memakai klaim status atomik; tipe terminal tidak di-resurrect oleh jalur generik (`approval.actions.ts:316-359`).
- STOK-06 tidak regresi — Journal/VendorPayment/StockAdjustment tetap gate-only (`approval.actions.ts:41`, `:306`, `:493`); temuan baru adalah R6WN-01 stale approval sesudah edit.
- Workflow update/delete menolak perubahan saat approval pending masih berjalan (`approval.actions.ts:685-724`, `:755-776`).
- `assertStepApprover` menahan user/role yang ditunjuk bila `userId`/`roleId` memang terisi (`approval.actions.ts:197-211`); lubangnya hanya langkah tanpa keduanya (R6WN-07).
- `markAsRead` aman ownership — update dibatasi `{ id, userId }` dan route memberi 404 seragam untuk baris hilang/milik orang lain (`notification.service.ts:399-405`).
- API notifikasi dropdown ter-scope ke user sesi dan unread count DB-nya benar (`src/app/api/notifications/route.ts:16-34`); yang salah adalah pemakaian awal di header dan hitungan halaman 50 baris (R6WN-08/R6WN-10).
- Link widget dashboard ke antrean persetujuan, stok menipis, faktur jatuh tempo, dan absensi menunjuk route yang ada; yang bermasalah adalah count global dan permission antrean (R6WN-03/R6WN-06).
- Link approval detail fallback slug ke ID dan resolver menerima keduanya; bukan route mati.
- Tidak ditemukan pengiriman email/Telegram/WhatsApp transaksional untuk approval pada service/action yang diaudit; temuan kanal adalah tidak adanya notifikasi tertarget sama sekali (R6WN-03).
- `requestApprovalIfConfigured` fail-open tanpa workflow adalah perilaku kompatibilitas yang sudah dikenal proyek; tidak dilaporkan ulang tanpa jalur baru. Jalur barunya yang dilaporkan adalah reopen sukses palsu (R6WN-04) dan ganti modelType money-gate (R6WN-05).
- Kondisi workflow `ApprovalWorkflowStep.conditions` untuk Quotation sudah dikenal sebagai penanda tampil dan bukan gerbang inti; tidak diangkat ulang sebagai temuan Round 6.
