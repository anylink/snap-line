'use strict'

// 剪贴板通道端到端测试：把示例图写入系统剪贴板，
// 运行中的晾片应在 ~1 秒内把它挂到线上（source=clipboard）。
const path = require('path')
const { app, clipboard, nativeImage } = require('electron')

app.whenReady().then(function () {
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'))
  clipboard.writeImage(img)
  console.log('CLIP_TEST: image written to clipboard, size=' + img.getSize().width + 'x' + img.getSize().height)
  app.quit()
})
