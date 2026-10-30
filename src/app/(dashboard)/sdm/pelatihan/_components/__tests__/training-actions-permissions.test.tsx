// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/development.actions", () => ({
  addTrainingParticipant: vi.fn(async () => ({ success: true })),
  createTraining: vi.fn(async () => ({ success: true })),
  setParticipantResult: vi.fn(async () => ({ success: true })),
  setTrainingStatus: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

import { ParticipantForm, ParticipantResultButtons, TrainingStatusButton } from "../training-actions"

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

const btn = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) ?? null

describe("training-actions gerbang izin UI (edit_trainings)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("tanpa canEdit: status + form peserta + hasil peserta hilang", () => {
    const a = mount(<TrainingStatusButton trainingId={1} status="scheduled" canEdit={false} />)
    expect(btn(a.container, "Selesai")).toBeNull()
    expect(btn(a.container, "Batalkan")).toBeNull()
    act(() => a.root.unmount())

    const b = mount(<ParticipantForm trainingId={1} employees={[{ id: 1, name: "Budi" }]} canEdit={false} />)
    expect(b.container.querySelector("form")).toBeNull()
    expect(btn(b.container, "Tambah Peserta")).toBeNull()
    act(() => b.root.unmount())

    const c = mount(<ParticipantResultButtons participantId={1} canEdit={false} />)
    expect(btn(c.container, "Hadir")).toBeNull()
    expect(btn(c.container, "Absen")).toBeNull()
    act(() => c.root.unmount())
  })

  it("dengan canEdit: ketiga kontrol tampil", () => {
    const a = mount(<TrainingStatusButton trainingId={1} status="scheduled" canEdit />)
    expect(btn(a.container, "Selesai")).not.toBeNull()
    expect(btn(a.container, "Batalkan")).not.toBeNull()
    act(() => a.root.unmount())

    const b = mount(<ParticipantForm trainingId={1} employees={[{ id: 1, name: "Budi" }]} canEdit />)
    expect(btn(b.container, "Tambah Peserta")).not.toBeNull()
    act(() => b.root.unmount())

    const c = mount(<ParticipantResultButtons participantId={1} canEdit />)
    expect(btn(c.container, "Hadir")).not.toBeNull()
    expect(btn(c.container, "Absen")).not.toBeNull()
    act(() => c.root.unmount())
  })

  it("halaman meneruskan edit_trainings sebagai canEdit ke ketiga kontrol", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/sdm/pelatihan/[slug]/page.tsx"),
      "utf8",
    )
    expect(page).toContain('hasPermission("edit_trainings")')
    expect(page).toContain("canEdit={canEdit}")
  })
})
