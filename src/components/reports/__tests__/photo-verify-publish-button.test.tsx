// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { act } from "react"

import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  verify: vi.fn(),
  publish: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock("@/actions/attachment-photo.actions", () => ({
  verifyPhotoAttachment: (...args: unknown[]) => mocks.verify(...args),
  publishPhotoAttachment: (...args: unknown[]) => mocks.publish(...args),
}))
vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => mocks.showError(...args),
  showSuccess: (...args: unknown[]) => mocks.showSuccess(...args),
}))

import { PhotoVerifyPublishButtons } from "../photo-verify-publish-button"

afterEach(() => {
  vi.clearAllMocks()
  clearRenderedCards()
})

describe("PhotoVerifyPublishButtons F-2026-10-24-096-S AC-PHOTO-5", () => {
  it("tanpa izin kedua tombol tidak tampil", () => {
    const { container, root } = renderCard(
      <PhotoVerifyPublishButtons attachmentId={4} photoName="a.jpg" isVerified={false} canVerify={false} canPublish={false} publishable />,
    )
    expect(container.querySelector('button[aria-label="Verifikasi foto a.jpg"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Tandai terbit foto a.jpg"]')).toBeNull()
    unmountCard(root)
  })

  it("verifikasi memanggil aksi + refresh; error server tampil verbatim", async () => {
    mocks.verify.mockResolvedValue({ ok: true })
    const { container, root } = renderCard(
      <PhotoVerifyPublishButtons attachmentId={4} photoName="a.jpg" isVerified={false} canVerify canPublish={false} publishable />,
    )
    const btn = container.querySelector<HTMLButtonElement>('button[aria-label="Verifikasi foto a.jpg"]')!
    expect(btn).not.toBeNull()
    await act(async () => { btn.click() })
    expect(mocks.verify).toHaveBeenCalledWith(4)
    expect(mocks.showSuccess).toHaveBeenCalledWith("Foto terverifikasi")
    expect(mocks.refresh).toHaveBeenCalled()
    unmountCard(root)

    vi.clearAllMocks()
    mocks.verify.mockRejectedValue(new Error("Foto serah terima tidak boleh diverifikasi pengunggahnya sendiri"))
    const second = renderCard(
      <PhotoVerifyPublishButtons attachmentId={5} photoName="b.jpg" isVerified={false} canVerify canPublish={false} publishable />,
    )
    const btn2 = second.container.querySelector<HTMLButtonElement>('button[aria-label="Verifikasi foto b.jpg"]')!
    await act(async () => { btn2.click() })
    expect(mocks.showError).toHaveBeenCalledWith("Foto serah terima tidak boleh diverifikasi pengunggahnya sendiri")
    unmountCard(second.root)
  })

  it("terbit hanya bila terverifikasi + kategori boleh terbit", async () => {
    mocks.publish.mockResolvedValue({ ok: true })
    const { container, root } = renderCard(
      <PhotoVerifyPublishButtons attachmentId={6} photoName="c.jpg" isVerified canVerify={false} canPublish publishable />,
    )
    const btn = container.querySelector<HTMLButtonElement>('button[aria-label="Tandai terbit foto c.jpg"]')!
    await act(async () => { btn.click() })
    expect(mocks.publish).toHaveBeenCalledWith(6)
    unmountCard(root)

    const blocked = renderCard(
      <PhotoVerifyPublishButtons attachmentId={7} photoName="d.jpg" isVerified canVerify={false} canPublish publishable={false} />,
    )
    expect(blocked.container.querySelector('button[aria-label="Tandai terbit foto d.jpg"]')).toBeNull()
    unmountCard(blocked.root)
  })
})
