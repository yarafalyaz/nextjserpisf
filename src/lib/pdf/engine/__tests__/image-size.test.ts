import { describe, it, expect } from "vitest"
import { imageSizeFromBuffer } from "../image-size"

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0)
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

function jpeg(width: number, height: number): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe0, 0x00, 0x10]), // APP0, panjang 16
    Buffer.alloc(14),
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]), // SOF0, presisi 8
    Buffer.from([(height >> 8) & 0xff, height & 0xff]),
    Buffer.from([(width >> 8) & 0xff, width & 0xff]),
    Buffer.alloc(10),
  ])
}

function gif(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(13)
  buffer.write("GIF89a", 0, "latin1")
  buffer.writeUInt16LE(width, 6)
  buffer.writeUInt16LE(height, 8)
  return buffer
}

function webpVp8x(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(40)
  buffer.write("RIFF", 0, "latin1")
  buffer.write("WEBP", 8, "latin1")
  buffer.write("VP8X", 12, "latin1")
  const w = width - 1
  const h = height - 1
  buffer[24] = w & 0xff
  buffer[25] = (w >> 8) & 0xff
  buffer[26] = (w >> 16) & 0xff
  buffer[27] = h & 0xff
  buffer[28] = (h >> 8) & 0xff
  buffer[29] = (h >> 16) & 0xff
  return buffer
}

describe("imageSizeFromBuffer", () => {
  it("membaca dimensi PNG", () => {
    expect(imageSizeFromBuffer(png(400, 120))).toEqual({ width: 400, height: 120 })
  })

  it("membaca dimensi JPEG dari segmen SOF", () => {
    expect(imageSizeFromBuffer(jpeg(512, 300))).toEqual({ width: 512, height: 300 })
  })

  it("membaca dimensi GIF", () => {
    expect(imageSizeFromBuffer(gif(320, 240))).toEqual({ width: 320, height: 240 })
  })

  it("membaca dimensi WebP VP8X", () => {
    expect(imageSizeFromBuffer(webpVp8x(400, 300))).toEqual({ width: 400, height: 300 })
  })

  it("mengembalikan null untuk berkas yang bukan gambar", () => {
    expect(imageSizeFromBuffer(Buffer.from("bukan gambar sama sekali"))).toBeNull()
  })

  it("mengembalikan null untuk buffer terlalu pendek", () => {
    expect(imageSizeFromBuffer(Buffer.from([0x89, 0x50]))).toBeNull()
  })
})
