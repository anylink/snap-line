'use strict'

// 冒烟测试：模拟"新截图落入系统截图文件夹"，验证晾片是否自动挂上。
// 运行前提：snap-line 应用已在运行（npm start）。

const fs = require('fs')
const path = require('path')

function resolveUserData() {
  const candidates = ['晾片', 'snap-line', '晾衣绳']
  for (const c of candidates) {
    const d = path.join(process.env.APPDATA || '', c)
    if (fs.existsSync(path.join(d, 'store.json'))) return d
  }
  return path.join(process.env.APPDATA || '', candidates[0])
}

const userData = resolveUserData()
const storeFile = path.join(userData, 'store.json')
const iconFile = path.join(__dirname, '..', 'assets', 'icon.png')

function readStore() {
  try { return JSON.parse(fs.readFileSync(storeFile, 'utf8')) } catch (e) { return null }
}

const store = readStore()
if (!store) {
  console.log('FAIL: store.json not found at ' + storeFile + ' (app not running?)')
  process.exit(1)
}

const before = (store.photos || []).length
const dir = store.settings.screenshotDir
if (!dir || !fs.existsSync(dir)) {
  console.log('FAIL: screenshot dir missing: ' + dir)
  process.exit(1)
}

const dest = path.join(dir, 'smoke-' + Date.now() + '.png')
fs.copyFileSync(iconFile, dest)
console.log('test image dropped into: ' + dest)

let tries = 0
const timer = setInterval(() => {
  tries++
  const s = readStore()
  const after = s ? (s.photos || []).length : 0
  if (after > before) {
    clearInterval(timer)
    const p = s.photos[0]
    console.log('PASS: photo on line, total=' + after + ', name=' + p.name + ', source=' + p.source)
    console.log('file exists: ' + fs.existsSync(p.path))
    process.exit(0)
  }
  if (tries > 30) {
    clearInterval(timer)
    console.log('FAIL: no photo appeared after 30s (before=' + before + ', after=' + after + ')')
    process.exit(1)
  }
}, 1000)
