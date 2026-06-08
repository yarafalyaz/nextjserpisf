import { prisma } from "../src/lib/db/prisma"
import { peekNextDocumentNumber } from "../src/lib/utils/document-number"

async function main() {
  const all = await prisma.warehouse.findMany({ select: { id: true, code: true, name: true, deletedAt: true }, orderBy: { id: "asc" } })
  console.log("total warehouses:", all.length, "visible:", all.filter(w => !w.deletedAt).length)
  console.log("sample codes:", all.slice(0, 3).map(w => w.code), "...", all.slice(-3).map(w => w.code))
  console.log("visible ones:", all.filter(w => !w.deletedAt).map(w => `${w.code}/${w.name}`))
  console.log("peek WH ->", await peekNextDocumentNumber("WH", "simple"))

  // vendor
  const v = await prisma.vendor.findMany({ select: { code: true, deletedAt: true }, orderBy: { id: "asc" } })
  console.log("vendors total:", v.length, "visible:", v.filter(x => !x.deletedAt).length)
  console.log("vendor sample codes:", v.slice(0, 3).map(x => x.code), "...", v.slice(-3).map(x => x.code))
  console.log("peek VND ->", await peekNextDocumentNumber("VND", "simple"))
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
