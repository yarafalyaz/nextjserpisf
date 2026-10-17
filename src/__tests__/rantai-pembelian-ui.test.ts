import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Penjaga WIRING rantai pembelian di lapisan halaman.
 *
 * Bug kelas ini tidak tertangkap unit test aksi: aksinya benar, tetapi UI-nya
 * tidak pernah menawarkan/mengirim apa yang dibutuhkan — tautannya tidak dirender,
 * parameter `?grId=`/`?poId=` tidak dibaca, atau formnya tidak menyertakan
 * `goodsReceiptId`. Test ini membaca halaman yang bersangkutan dan memerahkan diri
 * bila wiring itu hilang.
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
    expect(page).toMatch(/\/pembelian\/retur\/tambah\?poId=\$\{po\.id\}/);
  });
});

describe("halaman retur menerima sumber PO (?poId=)", () => {
  const page = read("src/app/(dashboard)/pembelian/retur/tambah/page.tsx");

  it("membaca parameter poId", () => {
    expect(page).toMatch(/searchParams/);
    expect(page).toMatch(/params\.poId/);
  });

  it("meng-prefill PO + baris dari qty yang sudah diterima", () => {
    expect(page).toMatch(/receivedQty/);
    expect(page).toMatch(/returnData=\{returnPrefill\}/);
  });
});

describe("halaman tagihan menerima sumber penerimaan (?grId=)", () => {
  const page = read("src/app/(dashboard)/pembelian/tagihan/tambah/page.tsx");

  it("membaca parameter grId dan memuat baris penerimaan", () => {
    expect(page).toMatch(/params\.grId/);
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
    expect(page).toMatch(/\/pembelian\/tagihan\/tambah\?grId=\$\{receipt\.id\}/);
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
