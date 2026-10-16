/**
 * Pembaca dimensi gambar dari header berkas (PNG / JPEG / GIF / WebP).
 *
 * jsPDF menanamkan gambar dengan ukuran yang kita tentukan, jadi rasio asli
 * harus diketahui lebih dulu — tanpa itu logo kop akan gepeng. Informasi ini
 * hanya ada di header berkas, dan ukuran asli tidak disimpan di database, jadi
 * dibaca langsung dari byte-nya (tanpa menambah dependensi native).
 *
 * Mengembalikan null bila format tidak dikenali; pemanggil memakai rasio default.
 */

export interface ImageSize {
  width: number
  height: number
}

function isPng(buffer: Buffer): boolean {
  return buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8
}

function isGif(buffer: Buffer): boolean {
  return buffer.length > 10 && buffer.toString("ascii", 0, 4) === "GIF8"
}

function isWebp(buffer: Buffer): boolean {
  return buffer.length > 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP"
}

/** JPEG menyimpan dimensi di segmen SOF (0xC0–0xCF, kecuali DHT/JPG/DAC). */
function jpegSize(buffer: Buffer): ImageSize | null {
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]
    // Marker tanpa payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const length = buffer.readUInt16BE(offset + 2)
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  return null
}

function webpSize(buffer: Buffer): ImageSize | null {
  const format = buffer.toString("ascii", 12, 16)
  // VP8X (extended): lebar/tinggi 24-bit little-endian minus 1.
  if (format === "VP8X") {
    return {
      width: (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1,
      height: (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1,
    }
  }
  // VP8 (lossy): start code 0x9d 0x01 0x2a diikuti 14-bit lebar/tinggi.
  if (format === "VP8 ") {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    }
  }
  // VP8L (lossless): 14-bit lebar/tinggi terkemas.
  if (format === "VP8L") {
    const bits = buffer.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  return null
}

export function imageSizeFromBuffer(buffer: Buffer): ImageSize | null {
  if (isPng(buffer)) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (isJpeg(buffer)) {
    return jpegSize(buffer)
  }
  if (isGif(buffer)) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
  }
  if (isWebp(buffer)) {
    return webpSize(buffer)
  }
  return null
}
