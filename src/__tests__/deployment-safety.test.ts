import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * P0-4: startup production tidak boleh mengubah skema database.
 * `prisma db push` di CMD/entrypoint berarti tiap restart kontainer menulis
 * ulang skema produksi tanpa riwayat migrasi yang teraudit, dan menutupi
 * drift rantai migrasi. Migrasi hanya lewat langkah rilis terkontrol
 * (`migrate deploy` di layanan `migrate` docker-compose.prod.yml).
 */
const ROOT = join(__dirname, "..", "..")

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8")
}

describe("deployment tidak mendorong skema saat boot", () => {
  it("Dockerfile tidak memanggil prisma db push", () => {
    const dockerfile = read("Dockerfile")
    expect(dockerfile).not.toContain("db push")
  })

  it("compose prod punya layanan migrate sekali-jalan (migrate deploy)", () => {
    const compose = read("docker-compose.prod.yml")
    expect(compose).toContain("migrate deploy")
  })

  it("compose prod memaku image berversi, bukan latest mengambang", () => {
    const compose = read("docker-compose.prod.yml")
    // Image harus rilis berversi/immutable; latest = tak bisa rollback pasti.
    // ${IMAGE_TAG...} tanpa default lolos (wajib diisi saat rilis, gagal keras
    // bila kosong) — yang dilarang hanya literal `:latest`.
    expect(compose).not.toContain(":latest")
  })

  it("compose prod tidak mempublish port database (P2-4)", () => {
    const compose = read("docker-compose.prod.yml")
    // MySQL hanya untuk service di network compose; akses admin via tunnel.
    // Baris publish mapping host ("3309:3306", "127.0.0.1:3306:3306") dilarang;
    // DATABASE_URL internal (db:3306) tetap boleh.
    expect(compose).not.toMatch(/^\s+-\s+"?\d[^"]*:3306"?\s*$/m)
  })

  it("versi Node konsisten: README, engines, Dockerfile (P2-5)", () => {
    const readme = read("README.md")
    const pkg = JSON.parse(read("package.json")) as { engines?: { node?: string } }
    const dockerfile = read("Dockerfile")
    // engines ^26 + Dockerfile node:26 + README 26+: satu suara. Mismatch
    // (mis. README 20+) membuat dev jalan di versi yang tak diuji.
    expect(pkg.engines?.node ?? "").toContain("26")
    expect(dockerfile).toContain("node:26")
    expect(readme).toMatch(/Node\.js 26\+/)
    expect(readme).not.toMatch(/Node\.js 20\+/)
  })

  it("tanpa script db:push — migrasi hanya via migrate deploy (P2-5)", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> }
    const scripts = Object.values(pkg.scripts ?? {}).join("\n")
    // Script npm `db push` adalah jalan pintas yang menutupi drift; rantai
    // migrasi hanya lewat `migrate deploy` (layanan migrate compose prod).
    expect(Object.keys(pkg.scripts ?? {})).not.toContain("db:push")
    expect(scripts).not.toContain("prisma db push")
  })

  it("compose prod tanpa password default (P2-4)", () => {
    const compose = read("docker-compose.prod.yml")
    // Kredensial wajib dari .env produksi via `:?`; default `:-...` di compose
    // (termasuk untuk MYSQL_*) = bocor di repo. Default non-kredensial
    // (DB_NAME, DB_USER, IMAGE_TAG) tetap boleh.
    expect(compose).not.toMatch(/MYSQL_.*PASSWORD.*:-[^}]*\w/)
    expect(compose).not.toMatch(/MYSQL_PASSWORD.*:-[^}]*\w/)
    expect(compose).toContain("DB_ROOT_PASSWORD")
  })
})
