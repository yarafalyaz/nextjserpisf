# Design Direction & Identity: YaraERP (`silengkap`)

> **Role**: Integrated Enterprise Resource Planning (ERP) platform for manufacturing, automotive workshop, trading, and distribution.
> **Philosophy**: Precision, functional clarity, high information density, and absolute integrity of data. Craftsmanship standard according to `antislop` guidelines (R-01 to R-40).

---

## 1. Personality & Brand Mood
- **Character**: Focused, industrial, robust, dependable, unobtrusive.
- **Tone**: Professional, clear Indonesian business terminology (e.g. *Faktur, Surat Jalan, Penerimaan, Penyesuaian, Buku Besar, Jurnal*).
- **Core Purpose**: Operators work in high-speed data entry, reconciliation, and ledger analysis. The interface serves their focus without visual distraction, decorative gimmicks, or generic AI templates.

---

## 2. Antislop Dials
- **ENERGY: 2/5 (Calm & Focused)**
  - No screaming neon accents, no decorative background grids, no rainbow gradients.
  - Subdued neutral zinc/slate palette with crisp, purposeful semantic colors for financial status.
- **RHYTHM: 3/5 (Structured & Predictable)**
  - Dense tabular layouts (`data-table`), consistent form fields (`form-input`), and clear hierarchical action bars.
  - Strict desktop and mobile parity (`table-mobile-cards` preserving full touch targets of 44px).
- **MOTION: 1/5 (Immediate & Subdued)**
  - Snappy, instant feedback (micro-transitions `<= 150ms`).
  - Zero decorative floating or bouncy keyframe animations. Respects `prefers-reduced-motion`.

---

## 3. Visual System & Color Palette

### Base Neutrals (Zinc & Dark Obsidian)
- **Primary / Accent**: `#18181b` (Dark zinc in light mode), `#fafafa` (Light zinc in dark mode).
- **Surface / Background**: Clean white (`#ffffff`) or light slate (`#fafafa`) for light mode; obsidian `#09090b` / card `#121215` for dark mode.
- **Borders & Dividers**: Crisp hair-line borders (`#e4e4e7` / `#27272a`).

### Semantic Status Colors (Financial & Operational Accuracy)
Colors must always communicate real state, never decorative flair:
- **Success (`#059669` / `#34d399`)**: Posted journals, paid invoices, approved transactions, valid stock counts.
- **Warning (`#d97706` / `#fbbf24`)**: Pending approval, open drafts, partially received orders, near-due receivables.
- **Danger (`#dc2626` / `#f87171`)**: Overdue invoices, rejected claims, voided transactions, out-of-stock items.
- **Info (`#2563eb` / `#60a5fa`)**: Informational notices, active audit trails, filter tags.

### Token Ownership (single source)
- Light brand/semantic colours are declared **once** in `@theme` (`src/app/globals.css`); dark overrides live only in `html.dark`.
- shadcn tokens (`--background`, `--card`, `--primary`, `--border`, dst.) are **aliases** of the app tokens (`--bg-*`, `--text-*`, `--color-*`, `--border-color`), bukan palet kedua.
- Legacy `ui/button` adalah wrapper tipis di atas `ui/shadcn/button`, jadi tidak ada dua implementasi tombol yang bisa menyimpang.

---

## 4. Typography & Iconography

### Typography
- **Primary Sans**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `sans-serif`.
  - Chosen for high legible density in financial reports, tabular numerals, and multi-column screens.
- **Monospace (Data Only)**: `JetBrains Mono`, `monospace`.
  - Exclusively used for serial numbers, document codes (`INV-2026-X`), NPWP, and currency amounts. Never used as decorative oversized headings.

### Iconography (Font Awesome Solid - Purpose Gate R-04)
- **Icon Set**: `@fortawesome/free-solid-svg-icons` diakses **hanya** lewat wrapper
  `@/components/ui/fontawesome-icons` (bukan impor Font Awesome langsung di
  komponen halaman). Wrapper mengekspor nama ikon gaya Lucide
  (`ShoppingCart`, `FileText`, `CheckCircle`, dst.) yang dipetakan ke definisi
  solid Font Awesome, sehingga API pemakaian tetap seragam: `size`, `className`,
  `style`, dan ref SVG.
- **Rendering**: Glyph solid terisi (bukan outline), jadi **tidak ada** aturan
  stroke width. Ukuran mengikuti `size`/`className`; default mewarisi `1em` dari
  induk agar tetap sejajar dengan teks 13-14px. Jangan mencampur keluarga ikon
  lain di deliverable yang sama.
- **Rule of Purpose**: Every icon represents a tangible operational object:
  - `ShoppingCart` (`faCartShopping`): Pembelian (Purchase orders).
  - `Receipt` (`faReceipt`) / `FileText` (`faFileLines`): Faktur & Tagihan.
  - `Truck` (`faTruck`): Pengiriman & Surat Jalan.
  - `Boxes` (`faBoxesStacked`) / `Package` (`faBox`): Inventaris & Gudang.
  - `Landmark` (`faBuildingColumns`) / `Scale` (`faScaleBalanced`): Keuangan & Buku Besar.
  - `ShieldCheck` (`faShieldHalved`) / `CheckCircle` (`faCircleCheck`): Persetujuan & Status Valid.
  - `Wrench` (`faWrench`) / `Factory` (`faIndustry`): Bengkel & Produksi.
  - *Banned*: `Sparkles`/magic, AI orb, lightning, atau robotik tanpa fungsi domain bisnis riil.

---

## 5. Interaction Affordances & Accessibility (R-32, R-39)
- **Cursor feedback**: Native controls (`button`, `a[href]`, `select`, `label[for]`, switches) declare `cursor: pointer`. Disabled states declare `cursor: not-allowed`.
- **Keyboard navigation**: Tab order follows visual flow, focus states use a clear focus ring (`box-shadow: 0 0 0 3px color-mix(...)`).
- **Touch Targets**: Min 44px on mobile via responsive wrappers (`table-mobile-cards`).
- **Glassmorphism / Blur**: Capped to sticky headers and sticky table toolbars (`backdrop-blur-xs`) solely to prevent background text bleed during scrolling.
