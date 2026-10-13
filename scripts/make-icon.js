'use strict'

// 程序化生成应用图标：256x256 PNG，2x 超采样抗锯齿，零依赖。
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 256
const SS = 2 // supersample
const W = SIZE * SS

const buf = Buffer.alloc(W * W * 4, 0)

function setPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= W) return
  const i = (y * W + x) * 4
  // src-over onto transparent buffer
  const sa = a / 255
  const da = buf[i + 3] / 255
  const oa = sa + da * (1 - sa)
  if (oa === 0) return
  buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / oa)
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa)
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa)
  buf[i + 3] = Math.round(oa * 255)
}

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
}

function fillRoundRect(x, y, w, h, r, color) {
  const [cr, cg, cb] = hex(color)
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.ceil(x + w), y1 = Math.ceil(y + h)
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const cx = Math.min(Math.max(px + 0.5, x + r), x + w - r)
      const cy = Math.min(Math.max(py + 0.5, y + r), y + h - r)
      const dx = px + 0.5 - cx
      const dy = py + 0.5 - cy
      if (dx * dx + dy * dy <= r * r + 0.25) setPx(px, py, cr, cg, cb, 255)
    }
  }
}

function strokeRoundRect(x, y, w, h, r, sw, color) {
  fillRoundRect(x, y, w, sw, Math.min(r, sw / 2), color)
  fillRoundRect(x, y + h - sw, w, sw, Math.min(r, sw / 2), color)
  fillRoundRect(x, y, sw, h, Math.min(r, sw / 2), color)
  fillRoundRect(x + w - sw, y, sw, h, Math.min(r, sw / 2), color)
}

function qbez(p0, p1, p2, t) {
  const mt = 1 - t
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
  }
}

function strokeQuad(p0, p1, p2, width, color) {
  const [cr, cg, cb] = hex(color)
  const pts = []
  for (let i = 0; i <= 120; i++) pts.push(qbez(p0, p1, p2, i / 120))
  const minX = Math.floor(Math.min(...pts.map((p) => p.x)) - width)
  const maxX = Math.ceil(Math.max(...pts.map((p) => p.x)) + width)
  const minY = Math.floor(Math.min(...pts.map((p) => p.y)) - width)
  const maxY = Math.ceil(Math.max(...pts.map((p) => p.y)) + width)
  const r2 = (width / 2) * (width / 2)
  for (let py = minY; py < maxY; py++) {
    for (let px = minX; px < maxX; px++) {
      const x = px + 0.5, y = py + 0.5
      let best = Infinity
      for (const p of pts) {
        const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)
        if (d < best) best = d
      }
      if (best <= r2) setPx(px, py, cr, cg, cb, 255)
    }
  }
}

function fillCircle(cx, cy, r, color) {
  const [cr, cg, cb] = hex(color)
  for (let py = Math.floor(cy - r); py < Math.ceil(cy + r); py++) {
    for (let px = Math.floor(cx - r); px < Math.ceil(cx + r); px++) {
      const dx = px + 0.5 - cx, dy = py + 0.5 - cy
      if (dx * dx + dy * dy <= r * r) setPx(px, py, cr, cg, cb, 255)
    }
  }
}

const S = SS // scale helper
fillRoundRect(8 * S, 8 * S, 240 * S, 240 * S, 48 * S, '#E1F5EE')
strokeQuad({ x: 28 * S, y: 78 * S }, { x: 128 * S, y: 102 * S }, { x: 228 * S, y: 78 * S }, 5 * S, '#a39a8b')

function photo(fx, fy, fw, fh, inner, pinX, pinY, pinW, pinH) {
  fillRoundRect(fx * S, fy * S, fw * S, fh * S, 3 * S, '#ffffff')
  strokeRoundRect(fx * S, fy * S, fw * S, fh * S, 3 * S, 2 * S, '#d8d2c8')
  fillRoundRect((fx + 6) * S, (fy + 6) * S, (fw - 12) * S, (fh - 12) * S, 2 * S, inner)
  fillRoundRect(pinX * S, pinY * S, pinW * S, pinH * S, 2.5 * S, '#c08f3e')
  fillCircle((pinX + pinW / 2) * S, (pinY + pinH * 0.42) * S, 2 * S, '#8a6a2f')
}

photo(44, 86, 56, 46, '#5DCAA5', 66, 68, 11, 22)
photo(98, 92, 62, 54, '#85B7EB', 123, 74, 12, 24)
photo(166, 86, 52, 44, '#F0997B', 186, 68, 11, 22)

// downsample 2x box filter
const out = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * W + (x * SS + sx)) * 4
        r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3]
      }
    }
    const o = (y * SIZE + x) * 4
    out[o] = r / (SS * SS); out[o + 1] = g / (SS * SS); out[o + 2] = b / (SS * SS); out[o + 3] = a / (SS * SS)
  }
}

// PNG encode
const crcTable = []
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c >>> 0
}
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc(SIZE * (1 + SIZE * 4))
for (let y = 0; y < SIZE; y++) {
  raw[y * (1 + SIZE * 4)] = 0
  out.copy(raw, y * (1 + SIZE * 4) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const outPath = path.join(__dirname, '..', 'assets', 'icon.png')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, png)
console.log('icon written: ' + outPath + ' (' + png.length + ' bytes)')
