import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Penjaga WIRING rantai pembelian di lapisan halaman.
 *
 * Bug kelas ini tidak tertangkap unit test aksi: aksinya benar, tetapi UI-nya
 * tidak pernah menawarkan/mengirim apa yang dibutuhkan — tautannya tidak dirender,
 * segmen prefill `penerimaan/<slug>`/`po/<slug>` tidak dibaca, atau formnya tidak
 * menyertakan `goodsReceiptId`. Test ini membaca halaman yang bersangkutan dan
 * memerahkan diri bila wiring itu hilang.
 */

const root = process.cwd();

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("halaman PO menampilkan retur turunannya", () => {
  const page = read("src/app/(dashboard)/pembelian/pesanan/[slug]/page.tsx");

  it("mengambil baris retur PO (bukan hanya headernya)", () => {
    expect(page).toMatch(/purchaseReturns:\s*\{\s*include:\s*\{\s*items:\s*true\s*\}\s*\}/);
  });

  it("merender daftar retur PO", () => {
    expect(page).toMatch(/po\.purchaseReturns\.map\(/);
    expect(page).toMatch(/label:\s*"Retur"/);
  });

  it("menyediakan jalur 'Buat Retur dari PO'", () => {
    expect(page).toMatch(/\/pembelian\/retur\/tambah\/po\/\$\{po\.slug \?\? po\.id\}/);
  });
});

describe("halaman retur menerima sumber PO (segmen po/<slug>)", () => {
  const page = read("src/app/(dashboard)/pembelian/retur/tambah/[[...segments]]/page.tsx");

  it("membaca segmen po dan memantulkan query lama", () => {
    expect(page).toMatch(/parsePrefillSegments\(segments, \["po"\]\)/);
    expect(page).toMatch(/resolvePrefillId\(prisma\.purchaseOrder, seg\.po/);
    expect(page).toMatch(/params\.poId/);
  });

  it("meng-prefill PO + baris dari qty yang sudah diterima", () => {
    expect(page).toMatch(/receivedQty/);
    expect(page).toMatch(/returnData=\{returnPrefill\}/);
  });
});

describe("halaman tagihan menerima sumber penerimaan (segmen penerimaan/<slug>)", () => {
  const page = read("src/app/(dashboard)/pembelian/tagihan/tambah/[[...segments]]/page.tsx");

  it("membaca segmen penerimaan dan memuat barisnya", () => {
    expect(page).toMatch(/parsePrefillSegments\(segments, \["po", "penerimaan"\]\)/);
    expect(page).toMatch(/resolvePrefillId\(prisma\.goodsReceipt, seg\.penerimaan/);
    expect(page).toMatch(/goodsReceipt\.findUnique/);
    expect(page).toMatch(/unitCost/);
  });

  it("mengirim goodsReceiptId lewat GoodsReceiptLinkFields", () => {
    expect(page).toMatch(/GoodsReceiptLinkFields/);
    expect(page).toMatch(/goodsReceiptId=\{billableGr\.id\}/);
  });

  it("hanya menawarkan penerimaan yang sudah diverifikasi", () => {
    expect(page).toMatch(/\["verified",\s*"completed"\]\.includes\(goodsReceipt\.status\)/);
  });
});

describe("halaman penerimaan menautkan ke tagihannya", () => {
  const page = read("src/app/(dashboard)/pembelian/penerimaan/[slug]/page.tsx");

  it("menyediakan tombol 'Buat Tagihan dari Penerimaan'", () => {
    expect(page).toMatch(/\/pembelian\/tagihan\/tambah\/penerimaan\/\$\{receipt\.slug \?\? receipt\.id\}/);
  });

  it("menampilkan tagihan yang menagih penerimaan ini", () => {
    expect(page).toMatch(/vendorBills:\s*\{/);
    expect(page).toMatch(/receipt\.vendorBills\.map\(/);
  });

  it("mengambil KEDUA penanda jurnal penerimaan (barang + jasa)", () => {
    expect(page).toMatch(/GOODS_RECEIPT_JOURNAL_REF_TYPE/);
    expect(page).toMatch(/GOODS_RECEIPT_SERVICE_JOURNAL_REF_TYPE/);
    expect(page).toMatch(/referenceType:\s*\{\s*in:/);
  });
});

describe("halaman tagihan bisa dikonfirmasi dari detail (bukan cuma dari tabel)", () => {
  const page = read("src/app/(dashboard)/pembelian/tagihan/[slug]/page.tsx");

  it("menawarkan tombol Konfirmasi saat draft", () => {
    // confirmVendorBill memposting jurnal utang — sebelumnya hanya ada di
    // tabel daftar, sehingga detail tagihan draft adalah jalan buntu.
    expect(page).toMatch(/confirmVendorBill/);
    expect(page).toMatch(/bill\.status === "draft"/);
  });
});
