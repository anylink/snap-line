'use strict'

const { app, BrowserWindow, screen, clipboard, nativeImage, shell, ipcMain, globalShortcut, Tray, Menu } = require('electron')

// 沙箱/受限环境下 GPU 进程会崩溃（0xC0000005），本应用界面简单，禁用硬件加速
app.disableHardwareAcceleration()

const path = require('path')
const fs = require('fs')
const Store = require('./store')

const LINE_HEIGHT = 240
// 跨平台加速键：Windows/Linux 上 CommandOrControl = Ctrl，与历史行为一致；macOS 上为 Command
const TOGGLE_ACCEL = 'CommandOrControl+Alt+T'
const TOGGLE_ACCEL_LABEL = (process.platform === 'darwin' ? 'Cmd' : 'Ctrl') + '+Alt+T'
const SELFCHECK_ACCEL = 'CommandOrControl+Alt+D'
const userDataDir = app.getPath('userData')
const capturesDir = path.join(userDataDir, 'captures')
const originalsDir = path.join(capturesDir, 'originals')
const recycleDir = path.join(userDataDir, 'recycle')
const debugFile = path.join(userDataDir, 'debug.log')

fs.mkdirSync(capturesDir, { recursive: true })
fs.mkdirSync(originalsDir, { recursive: true })
fs.mkdirSync(recycleDir, { recursive: true })

function log() {
  const line = '[' + new Date().toISOString() + '] ' + Array.from(arguments).map(function (a) {
    if (a instanceof Error) return a.message
    return typeof a === 'string' ? a : JSON.stringify(a)
  }).join(' ') + '\n'
  try { fs.appendFileSync(debugFile, line) } catch (e) {}
}

const store = new Store(path.join(userDataDir, 'store.json'))

let tray = null
let lineWindows = []
const expandedWins = new Set()
const expandMode = new Map() // winId -> 'hover' | 'toggle'
let pollTimer = null
let clipboardTimer = null
let screenshotTimer = null
const knownScreenshotFiles = new Set()
const pendingFiles = new Map()
let lastClipboardHash = ''

function detectScreenshotDir() {
  const platform = process.platform
  const candidates = []

  if (platform === 'darwin') {
    // macOS：系统截图默认存桌面；若用户改过保存位置，常见为 图片/Screenshots
    candidates.push(path.join(app.getPath('desktop')))
    candidates.push(path.join(app.getPath('pictures'), 'Screenshots'))
  } else if (platform === 'linux') {
    // Linux(GNOME)：默认 图片/Screenshots；部分发行版/旧版本存桌面
    candidates.push(path.join(app.getPath('pictures'), 'Screenshots'))
    candidates.push(path.join(app.getPath('desktop')))
  } else {
    // Windows：图片\屏幕截图（含各语言本地化目录名）
    const pictures = app.getPath('pictures')
    const names = ['Screenshots', '屏幕截图', 'Captures d\u00e9cran', 'Capturas de pantalla', 'Bildschirmfotos', 'Schermafbeeldingen']
    for (const n of names) candidates.push(path.join(pictures, n))
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }

  // 兜底：按平台约定建一个默认目录
  let fallback
  if (platform === 'darwin') {
    fallback = path.join(app.getPath('desktop'))
  } else if (platform === 'linux') {
    fallback = path.join(app.getPath('pictures'), 'Screenshots')
  } else {
    fallback = path.join(app.getPath('pictures'), app.getLocale().toLowerCase().indexOf('zh') === 0 ? '屏幕截图' : 'Screenshots')
  }
  try { fs.mkdirSync(fallback, { recursive: true }) } catch (e) { log('mkdir screenshot dir failed', e) }
  return fallback
}

function getScreenshotDir() {
  if (!store.data.settings.screenshotDir) {
    store.data.settings.screenshotDir = detectScreenshotDir()
    store.save()
  }
  return store.data.settings.screenshotDir
}

function broadcastPhotos() {
  const photos = store.data.photos
  for (const entry of lineWindows) {
    try { entry.win.webContents.send('photos-changed', photos) } catch (e) {}
  }
  if (tray) tray.setContextMenu(buildTrayMenu())
}

function addPhoto(filePath, source) {
  const p = {
    id: 'p' + Date.now() + Math.random().toString(36).slice(2, 7),
    path: filePath,
    name: path.basename(filePath),
    source: source,
    addedAt: Date.now()
  }
  store.addPhoto(p)
  broadcastPhotos()
  log('photo added:', p.name, 'source=' + source, 'total=' + store.data.photos.length)
  return p
}

function ingestFile(srcPath, source) {
  try {
    const base = path.basename(srcPath)
    const safe = base.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
    const dest = path.join(capturesDir, source + '-' + Date.now() + '-' + safe)
    fs.copyFileSync(srcPath, dest)
    if (store.data.settings.moveScreenshots && source === 'screenshot') {
      try { fs.renameSync(srcPath, path.join(originalsDir, 'original-' + Date.now() + '-' + safe)) } catch (e) { log('move original failed', e) }
    }
    addPhoto(dest, source)
  } catch (e) {
    log('ingest failed', srcPath, e)
  }
}

function baselineScreenshots() {
  knownScreenshotFiles.clear()
  pendingFiles.clear()
  let files = []
  try { files = fs.readdirSync(getScreenshotDir()) } catch (e) { return }
  for (const f of files) {
    if (/\.(png|jpe?g)$/i.test(f)) knownScreenshotFiles.add(f)
  }
  log('screenshot baseline:', knownScreenshotFiles.size, 'existing files in', getScreenshotDir())
}

function scanScreenshots() {
  const dir = getScreenshotDir()
  let files = []
  try { files = fs.readdirSync(dir) } catch (e) { return }
  for (const f of files) {
    if (!/\.(png|jpe?g)$/i.test(f)) continue
    if (knownScreenshotFiles.has(f)) continue
    const full = path.join(dir, f)
    let st = null
    try { st = fs.statSync(full) } catch (e) { continue }
    if (!st.isFile()) continue
    const prev = pendingFiles.get(f)
    if (prev && prev.size === st.size && st.size > 1024) {
      pendingFiles.delete(f)
      knownScreenshotFiles.add(f)
      ingestFile(full, 'screenshot')
    } else {
      pendingFiles.set(f, { size: st.size })
    }
  }
}

function imageHash(img) {
  const size = img.getSize()
  const url = img.toDataURL()
  return size.width + 'x' + size.height + ':' + url.slice(-48)
}

function pollClipboard() {
  try {
    const formats = clipboard.availableFormats() || []
    const hasImage = formats.some(function (f) { return /^image\//.test(f) })
    const hasText = formats.indexOf('text/plain') !== -1 || formats.indexOf('text/html') !== -1 || formats.indexOf('text/uri-list') !== -1
    if (!hasImage || hasText) return
    const img = clipboard.readImage()
    if (img.isEmpty()) return
    const h = imageHash(img)
    if (h === lastClipboardHash) return
    lastClipboardHash = h
    const dest = path.join(capturesDir, 'clipboard-' + Date.now() + '.png')
    fs.writeFileSync(dest, img.toPNG())
    addPhoto(dest, 'clipboard')
  } catch (e) {
    log('clipboard poll error', e)
  }
}

function entryForSender(sender) {
  for (const entry of lineWindows) {
    if (entry.win.webContents === sender) return entry
  }
  return null
}

function expandWindow(entry, mode) {
  if (!entry) return
  mode = mode || 'hover'
  if (expandedWins.has(entry.id)) {
    if (mode === 'hover') expandMode.set(entry.id, 'hover')
    return
  }
  expandedWins.add(entry.id)
  expandMode.set(entry.id, mode)
  entry.win.setIgnoreMouseEvents(false)
  try { entry.win.webContents.send('set-open', true) } catch (e) {}
  log('expand window', entry.displayId, 'mode=' + mode)
  ensurePoll()
  if (tray) tray.setContextMenu(buildTrayMenu())
}

function collapseWindow(entry) {
  if (!entry || !expandedWins.has(entry.id)) return
  expandedWins.delete(entry.id)
  expandMode.delete(entry.id)
  entry.win.setIgnoreMouseEvents(true, { forward: true })
  try { entry.win.webContents.send('set-open', false) } catch (e) {}
  log('collapse window', entry.displayId)
  if (tray) tray.setContextMenu(buildTrayMenu())
}

function toggleAll() {
  if (expandedWins.size > 0) {
    for (const entry of Array.from(lineWindows)) collapseWindow(entry)
  } else {
    for (const entry of lineWindows) expandWindow(entry, 'toggle')
  }
}

function ensurePoll() {
  if (pollTimer) return
  pollTimer = setInterval(function () {
    if (expandedWins.size === 0) {
      clearInterval(pollTimer)
      pollTimer = null
      return
    }
    const pt = screen.getCursorScreenPoint()
    for (const entry of Array.from(lineWindows)) {
      if (!expandedWins.has(entry.id)) continue
      const b = entry.win.getBounds()
      const inside = pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height
      const mode = expandMode.get(entry.id)
      if (mode === 'hover' && !inside) {
        collapseWindow(entry)
      } else if (mode === 'toggle' && inside) {
        expandMode.set(entry.id, 'hover')
      }
    }
  }, 250)
}

function createLineWindows() {
  for (const entry of lineWindows) {
    try { entry.win.destroy() } catch (e) {}
  }
  lineWindows = []
  expandedWins.clear()
  expandMode.clear()
  const displays = screen.getAllDisplays()
  for (const d of displays) {
    const win = new BrowserWindow({
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: LINE_HEIGHT,
      transparent: true,
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      focusable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setIgnoreMouseEvents(true, { forward: true })
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
    win.once('ready-to-show', function () { win.showInactive() })
    win.on('closed', function () {
      expandedWins.delete(win.id)
      lineWindows = lineWindows.filter(function (e) { return e.win !== win })
    })
    lineWindows.push({ win: win, id: win.id, displayId: d.id })
  }
  log('line windows created:', lineWindows.length)
  broadcastPhotos()
}

function findPhoto(id) {
  for (const p of store.data.photos) {
    if (p.id === id) return p
  }
  return null
}

function testCopyImage() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'))
    clipboard.writeImage(img)
    log('test image written to clipboard')
  } catch (e) { log('test copy failed', e) }
}

function buildTrayMenu() {
  const anyOpen = expandedWins.size > 0
  const items = [
    { label: anyOpen ? '收起晾片' : '展开晾片 (' + TOGGLE_ACCEL_LABEL + ')', click: function () { toggleAll() } },
    { label: '复制示例图到剪贴板（测试剪贴板通道）', click: testCopyImage },
    { type: 'separator' },
    { label: '打开截图文件夹', click: function () { shell.openPath(getScreenshotDir()) } },
    { label: '打开存放目录', click: function () { shell.openPath(capturesDir) } },
    { type: 'separator' },
    {
      label: '截图后移入晾片（系统文件夹不留底）',
      type: 'checkbox',
      checked: store.data.settings.moveScreenshots,
      click: function (mi) { store.data.settings.moveScreenshots = mi.checked; store.save() }
    }
  ]
  // 开机自启：Electron 仅实现了 Windows / macOS，Linux 上调用会抛错，故隐藏该菜单项
  if (process.platform === 'win32' || process.platform === 'darwin') {
    items.push({
      label: '开机自启',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: function (mi) { app.setLoginItemSettings({ openAtLogin: mi.checked }) }
    })
  }
  items.push({ type: 'separator' })
  items.push({ label: '清空晾片', click: function () { store.clear(); broadcastPhotos() } })
  items.push({ label: '退出', click: function () { app.quit() } })
  return Menu.buildFromTemplate(items)
}

function captureSelfCheck() {
  const dir = path.join(userDataDir, 'selfcheck')
  try { fs.mkdirSync(dir, { recursive: true }) } catch (e) {}
  for (const entry of lineWindows) {
    entry.win.webContents.capturePage().then(function (img) {
      const p = path.join(dir, 'line-' + entry.displayId + '-' + Date.now() + '.png')
      try {
        fs.writeFileSync(p, img.toPNG())
        log('selfcheck capture saved:', p)
      } catch (e) { log('capture save failed', e) }
    }).catch(function (e) { log('capturePage failed', e) })
  }
}

function registerIpc() {
  ipcMain.handle('get-photos', function () { return store.data.photos })

  ipcMain.handle('copy-photo', function (event, id) {
    const p = findPhoto(id)
    if (!p) return false
    try {
      clipboard.writeImage(nativeImage.createFromPath(p.path))
      log('copied to clipboard:', p.name)
      event.sender.send('photo-copied', true)
      return true
    } catch (e) {
      log('copy failed', e)
      return false
    }
  })

  ipcMain.handle('open-photo', function (event, id) {
    const p = findPhoto(id)
    if (!p) return ''
    return shell.openPath(p.path)
  })

  ipcMain.handle('show-in-folder', function (event, id) {
    const p = findPhoto(id)
    if (!p) return
    shell.showItemInFolder(p.path)
  })

  ipcMain.handle('trash-photo', function (event, id) {
    const p = findPhoto(id)
    if (!p) return
    try {
      fs.renameSync(p.path, path.join(recycleDir, path.basename(p.path)))
    } catch (e) { log('recycle move failed', e) }
    store.removePhoto(id)
    broadcastPhotos()
  })

  ipcMain.on('start-drag', function (event, payload) {
    try {
      const img = nativeImage.createFromPath(payload.path)
      const size = img.getSize()
      const maxSide = 96
      const scale = Math.min(maxSide / size.width, maxSide / size.height, 1)
      const icon = scale < 1 ? img.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale) }) : img
      event.sender.startDrag({ file: payload.path, icon: icon })
      log('drag started:', payload.path)
    } catch (e) { log('startDrag failed', e) }
  })

  ipcMain.on('photo-left-window', function (event, id) {
    const p = findPhoto(id)
    if (!p) return
    log('photo dragged out (file kept):', p.name)
    store.removePhoto(id)
    broadcastPhotos()
  })

  ipcMain.on('hover-top', function (event) {
    const entry = entryForSender(event.sender)
    log('hover-top received, display=' + (entry ? entry.displayId : 'unknown'))
    if (entry) expandWindow(entry)
  })

  ipcMain.on('mouse-left-window', function (event) {
    const entry = entryForSender(event.sender)
    if (entry) collapseWindow(entry)
  })

  ipcMain.on('show-photo-menu', function (event, payload) {
    const entry = entryForSender(event.sender)
    const p = findPhoto(payload.id)
    if (!entry || !p) return
    const b = entry.win.getBounds()
    const menu = Menu.buildFromTemplate([
      { label: '复制图片', click: function () { clipboard.writeImage(nativeImage.createFromPath(p.path)) } },
      { label: '打开', click: function () { shell.openPath(p.path) } },
      { label: '在文件夹中显示', click: function () { shell.showItemInFolder(p.path) } },
      { type: 'separator' },
      { label: '从晾片移除', click: function () { store.removePhoto(p.id); broadcastPhotos() } }
    ])
    menu.popup({ window: entry.win, x: b.x + payload.x, y: b.y + payload.y })
  })
}

let metricsTimer = null
app.whenReady().then(function () {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  registerIpc()
  getScreenshotDir()
  createLineWindows()

  tray = new Tray(path.join(__dirname, '..', 'assets', 'icon.png'))
  tray.setToolTip('晾片 SnapLine — 截图挂这里')
  tray.setContextMenu(buildTrayMenu())

  try {
    globalShortcut.register(TOGGLE_ACCEL, function () { toggleAll() })
    globalShortcut.register(SELFCHECK_ACCEL, captureSelfCheck)
    log('shortcuts registered: ' + TOGGLE_ACCEL_LABEL + ' (toggle), ' + SELFCHECK_ACCEL + ' (selfcheck)')
  } catch (e) { log('global shortcut register failed', e) }

  baselineScreenshots()
  screenshotTimer = setInterval(scanScreenshots, 1200)
  clipboardTimer = setInterval(pollClipboard, 900)
  try {
    lastClipboardHash = clipboard.readImage().isEmpty() ? '' : imageHash(clipboard.readImage())
  } catch (e) {}

  screen.on('display-metrics-changed', function () {
    if (metricsTimer) clearTimeout(metricsTimer)
    metricsTimer = setTimeout(createLineWindows, 600)
  })

  // 调试钩子：SNAPLINE_DEBUG=expand,capture 启动后自动展开并截图自查（无头环境验证用）
  const debugFlags = (process.env.SNAPLINE_DEBUG || '').split(',')
  if (debugFlags.indexOf('expand') !== -1) {
    setTimeout(function () {
      for (const entry of lineWindows) expandWindow(entry, 'toggle')
    }, 1500)
  }
  if (debugFlags.indexOf('capture') !== -1) {
    setTimeout(captureSelfCheck, 4500)
  }

  log('app ready. screenshotDir=' + getScreenshotDir() + ' displays=' + screen.getAllDisplays().length)
})

app.on('second-instance', function () { toggleAll() })
app.on('window-all-closed', function (event) { event.preventDefault() })
