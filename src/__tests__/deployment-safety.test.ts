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
})
