import Link from "next/link"
import { Users } from "lucide-react"
import {
  CustomerDuplicateCandidateRow,
  type CustomerDuplicateCandidateView,
} from "@/components/forms/customer-duplicate-warning"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

// Daftar kandidat duplikat bergrup (AC-CD-F2, kontrak
// listCustomerDuplicateCandidates PR #791): grup + matchLabel + key
// dirender verbatim dari server; grup <2 tidak pernah dikirim server
// dan tidak ditampilkan di sini. Pembersihan manual lewat tautan
// detail/ubah existing — tidak ada merge master (BR-CD-08).
export interface CustomerDuplicateGroupView {
  matchKind: "npwp" | "phone" | "name_secondary"
  matchLabel: string
  key: string
  members: CustomerDuplicateCandidateView[]
}

export function CustomerDuplicateGroups({
  groups,
}: {
  groups: CustomerDuplicateGroupView[]
}) {
  const visible = groups.filter((group) => group.members.length >= 2)
  if (visible.length === 0) return null

  return (
    <section aria-label="Kandidat pelanggan ganda" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-warning" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground sm:text-lg">
          Kandidat Pelanggan Ganda
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Kelompok pelanggan aktif dengan kunci yang sama. Periksa detail tiap
        pelanggan, lalu bersihkan manual lewat ubah/nonaktifkan/hapus yang
        sudah ada — tidak ada penggabungan master otomatis.
      </p>
      {visible.map((group) => (
        <div
          key={`${group.matchKind}-${group.key}`}
          className="rounded-xl border border-default bg-surface p-4 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-foreground">
            {group.matchLabel}: {group.key} ({group.members.length} pelanggan)
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {group.members.map((member) => (
              <li key={member.id}>
                <CustomerDuplicateCandidateRow candidate={member} />
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 px-1 text-sm">
                  <Link
                    href={entityEditHref("/master/pelanggan", member)}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Ubah {member.name}
                  </Link>
                  <Link
                    href={entityHref("/master/pelanggan", member)}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Detail {member.name}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
