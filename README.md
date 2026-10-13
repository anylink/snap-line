# 晾片 SnapLine (PC 版)

> 把截图挂到屏幕顶部的一根绳子上 —— Tendedero 的 Windows 复刻版。
> 原版：github.com/alejandrobujan/tendedero（macOS / Swift）。本仓库为 PC（Windows）复刻，代码原创，MIT 许可。

## 这是什么

每截一张图（或复制一张图片），它就自动"挂"到屏幕最上方的一根绳子上：

- 鼠标移到屏幕最顶沿 → 绳子带着所有照片滑下来
- 鼠标移开 → 自动收起，不挡视线
- **单击**照片 → 复制到剪贴板
- **双击** → 用默认应用打开
- **右键** → 菜单（复制 / 打开 / 在文件夹中显示 / 从晾片移除）
- **拖拽**照片到别的应用或文件夹 → 直接投递（文件留在原处，离开晾片）
- **拖到右下角回收站图标** → 移除（文件移入回收目录，不删除）
- **Ctrl+Alt+T** → 全局显示/隐藏晾片
- 托盘图标 → 完整菜单（展开/收起、打开截图文件夹、存放目录、开机自启、退出）

截图默认**不落桌面、不进系统截图文件夹的视线**——应用自动把新截图归档到自己的数据目录。

## 快速开始

```bash
npm install     # 安装 electron
npm start       # 启动
```

### 重要：受限/沙箱环境启动方式

本机如果设了 `ELECTRON_RUN_AS_NODE=1`（部分工具链会这么做），electron.exe 会退化成纯 Node，`app` 对象为 undefined。启动前先清掉：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm start
```

`package.json` 的 start 脚本已带 `--no-sandbox --disable-gpu`：前者规避受限环境的 Chromium 沙箱崩溃（GPU 进程 0xC0000005），后者配合 `app.disableHardwareAcceleration()` 走软件渲染。普通桌面环境可以去掉这两个参数。

## 数据位置

全部在 `%APPDATA%\晾片\`（Electron userData，随 package.json 的 productName）：

| 目录/文件 | 用途 |
|---|---|
| `captures\` | 挂上晾片的图片文件（截图 + 剪贴板图片） |
| `captures\originals\` | 开启"截图后移入晾片"时，系统截图文件夹里的原文件挪到这里 |
| `recycle\` | 从晾片移除的文件（可找回，不删除） |
| `store.json` | 晾片上的照片列表 + 设置 |
| `debug.log` | 运行日志（排查问题看这个） |
| `selfcheck\` | Ctrl+Alt+D 界面自查截图 |

监听目录：系统截图文件夹（自动识别中英文路径，默认 `图片\屏幕截图`）。用户在 Windows 设置里改了截图保存位置的话，目前需要手动同步（P1 做设置界面）。

## 代码结构

```
snap-line/
├── package.json
├── src/
│   ├── main.js            主进程：多屏窗口/托盘/快捷键/双通道监听/IPC
│   ├── preload.js         渲染进程安全桥
│   ├── store.js           JSON 持久化（照片列表+设置）
│   └── renderer/
│       ├── index.html     晾片页面（绳子/照片/回收站/提示）
│       ├── renderer.js    交互逻辑（点击/双击/拖拽/悬停）
│       └── styles.css     视觉（玻璃相框/衣夹/摆动/飞入动画）
├── scripts/
│   ├── make-icon.js       程序化生成应用图标（PNG 编码器，零依赖）
│   ├── smoke-test.js      冒烟测试：往截图文件夹丢图，验证自动挂线
│   ├── clip-test.js       剪贴板通道测试：写图到剪贴板，验证自动挂线
│   └── migrate-userdata.js 旧目录名数据迁移工具（复制式，保留原目录）
├── LICENSE                MIT
└── assets/icon.png        应用/托盘图标
```

## 技术要点

- **多屏**：每个显示器一个透明置顶窗（`WS_EX_LAYERED` + `TOPMOST` + screen-saver 层级），`EnumDisplayMonitors` 遍历。
- **点击穿透**：收起时 `setIgnoreMouseEvents(true, {forward:true})`——窗口不挡鼠标，但渲染层仍能收到 `mousemove`，实现"鼠标碰顶沿即展开"。
- **两种展开模式**：悬停展开（`hover`，鼠标离开即收起）与快捷键/托盘展开（`toggle`，保持展开；鼠标进入后自动转 hover 语义）。
- **截图监听**：轮询扫描系统截图文件夹（比 fs.watch 在 Windows 上稳），文件大小两次扫描稳定后才收录（避免截到写一半的文件）。
- **剪贴板监听**：轮询 `availableFormats`，仅收纯图片（有 text/plain、text/uri-list 的混合内容跳过）；与上次内容哈希去重。
- **拖出**：`webContents.startDrag({file, icon})` 发起 OLE 文件拖放，可拖进任意应用/文件夹。
- **图标**：`scripts/make-icon.js` 用 Node 内置 zlib 手写 PNG 编码器 + 2x 超采样绘制，零依赖。

## 自测命令

```bash
# 应用运行中：
node scripts/smoke-test.js   # 模拟新截图 → 应输出 PASS
node scripts/clip-test.js    # 需要先启动 electron（见文件头说明）
```

或直接手动：按 `Win+Shift+S` 截一张图，看屏幕顶部。

## 已知限制（P1 待办）

- 标注功能未做（原版的 Markup；计划内置 Canvas 标注）
- 录屏挂线未做（监听 `视频\捕获` 目录）
- 空格快速预览窗未做
- 全屏应用时自动隐藏未做（当前 screen-saver 层级会盖在全屏应用上）
- 监听目录/快捷键的设置界面未做（目前改 `store.json`）
- Windows 无法"接管"系统截图设置（macOS 原版可以），这是平台差异，已用双通道监听弥补

## 许可

MIT（名称与图标均为本项目原创，无原版资产）
