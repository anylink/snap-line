// 单测：从 main.js 中抽出 detectScreenshotDir，在三个平台下用桩数据验证其返回值
// 运行：node scripts/test-detect-dir.js
'use strict'
const fs = require('fs')
const path = require('path')

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8')
const m = mainSrc.match(/function detectScreenshotDir\(\) \{[\s\S]*?\n\}/)
if (!m) { console.log('FAIL: 未能从 main.js 抽出 detectScreenshotDir'); process.exit(1) }
const fnSrc = m[0]

// 桩：与平台无关的家目录约定（注意用 path.join 生成，保证分隔符一致）
const HOME = { desktop: path.join('/home/u', 'Desktop'), pictures: path.join('/home/u', 'Pictures') }

function runAs(platform, existingPaths) {
  const sandbox = {
    process: { platform: platform },
    app: {
      getPath: function (name) { return HOME[name] },
      getLocale: function () { return 'zh-CN' }
    },
    path: path,
    fs: {
      existsSync: function (p) { return existingPaths.indexOf(p) !== -1 },
      mkdirSync: function () {}
    },
    log: function () {}
  }
  const keys = Object.keys(sandbox)
  const vals = keys.map(function (k) { return sandbox[k] })
  const factory = new Function(keys.join(','), fnSrc + '\nreturn detectScreenshotDir()')
  return factory.apply(null, vals)
}

const cases = [
  { name: 'Windows / 中文（图片\\屏幕截图 存在）', platform: 'win32', existing: [path.join(HOME.pictures, '屏幕截图')], expect: path.join(HOME.pictures, '屏幕截图') },
  { name: 'Windows / 英文（Pictures\\Screenshots 存在）', platform: 'win32', existing: [path.join(HOME.pictures, 'Screenshots')], expect: path.join(HOME.pictures, 'Screenshots') },
  { name: 'Windows / 德文（Bildschirmfotos 存在）', platform: 'win32', existing: [path.join(HOME.pictures, 'Bildschirmfotos')], expect: path.join(HOME.pictures, 'Bildschirmfotos') },
  { name: 'Windows / 法文（Captures d\'écran 存在）', platform: 'win32', existing: [path.join(HOME.pictures, 'Captures d\u00e9cran')], expect: path.join(HOME.pictures, 'Captures d\u00e9cran') },
  { name: 'Windows / 什么都不存在（中文兜底）', platform: 'win32', existing: [], expect: path.join(HOME.pictures, '屏幕截图') },
  { name: 'macOS / 桌面存在', platform: 'darwin', existing: [HOME.desktop], expect: HOME.desktop },
  { name: 'macOS / 桌面不存在、Pictures/Screenshots 存在', platform: 'darwin', existing: [path.join(HOME.pictures, 'Screenshots')], expect: path.join(HOME.pictures, 'Screenshots') },
  { name: 'macOS / 什么都不存在（桌面兜底）', platform: 'darwin', existing: [], expect: HOME.desktop },
  { name: 'Linux / Pictures/Screenshots 存在', platform: 'linux', existing: [path.join(HOME.pictures, 'Screenshots')], expect: path.join(HOME.pictures, 'Screenshots') },
  { name: 'Linux / 只有桌面', platform: 'linux', existing: [HOME.desktop], expect: HOME.desktop },
  { name: 'Linux / 什么都不存在（Pictures/Screenshots 兜底）', platform: 'linux', existing: [], expect: path.join(HOME.pictures, 'Screenshots') }
]

let pass = 0
let fail = 0
for (const c of cases) {
  let got
  try { got = runAs(c.platform, c.existing) } catch (e) { got = 'THREW: ' + e.message }
  const ok = got === c.expect
  if (ok) pass++; else fail++
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + c.name)
  if (!ok) console.log('        expect=' + c.expect + '  got=' + got)
}
console.log('')
console.log('结果: ' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail === 0 ? 0 : 1)
