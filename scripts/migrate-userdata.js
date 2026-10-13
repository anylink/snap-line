'use strict'

// 迁移工具：应用从「晾衣绳」改名为「晾片」后，Electron 的 userData 目录
// 会随 productName 变化（%APPDATA%\晾衣绳 → %APPDATA%\晾片）。
// 本脚本把旧目录里的用户数据复制到新目录；旧目录原样保留作备份，不做删除。
//
// 用法（先确保应用已退出）：
//   node scripts/migrate-userdata.js

const fs = require('fs')
const path = require('path')

const OLD_NAME = '晾衣绳'
const NEW_NAME = '晾片'
const COPY_DIRS = ['captures', 'recycle', 'selfcheck']
const COPY_FILES = ['store.json', 'debug.log']

const base = process.env.APPDATA || ''
const oldDir = path.join(base, OLD_NAME)
const newDir = path.join(base, NEW_NAME)

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyTree(s, d)
    else fs.copyFileSync(s, d)
  }
}

if (!fs.existsSync(oldDir)) {
  console.log('旧目录不存在，无需迁移: ' + oldDir)
  process.exit(0)
}

fs.mkdirSync(newDir, { recursive: true })

const copied = []
for (const dir of COPY_DIRS) {
  const s = path.join(oldDir, dir)
  if (!fs.existsSync(s)) continue
  const n = fs.readdirSync(s).length
  copyTree(s, path.join(newDir, dir))
  copied.push(dir + '/ (' + n + ' 项)')
}
for (const f of COPY_FILES) {
  const s = path.join(oldDir, f)
  if (!fs.existsSync(s)) continue
  fs.copyFileSync(s, path.join(newDir, f))
  copied.push(f + ' (' + Math.round(fs.statSync(s).size / 1024) + ' KB)')
}

console.log('迁移完成 -> ' + newDir)
console.log('已复制: ' + (copied.join(', ') || '(无)'))
console.log('旧目录保留作备份: ' + oldDir)
