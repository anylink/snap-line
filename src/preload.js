'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('snapLine', {
  getPhotos: () => ipcRenderer.invoke('get-photos'),
  copyPhoto: (id) => ipcRenderer.invoke('copy-photo', id),
  openPhoto: (id) => ipcRenderer.invoke('open-photo', id),
  showInFolder: (id) => ipcRenderer.invoke('show-in-folder', id),
  trashPhoto: (id) => ipcRenderer.invoke('trash-photo', id),
  startDrag: (id, filePath) => ipcRenderer.send('start-drag', { id: id, path: filePath }),
  photoLeftWindow: (id) => ipcRenderer.send('photo-left-window', id),
  hoverTop: () => ipcRenderer.send('hover-top'),
  mouseLeftWindow: () => ipcRenderer.send('mouse-left-window'),
  showPhotoMenu: (id, x, y) => ipcRenderer.send('show-photo-menu', { id: id, x: x, y: y }),
  onPhotosChanged: (cb) => ipcRenderer.on('photos-changed', (_e, photos) => cb(photos)),
  onSetOpen: (cb) => ipcRenderer.on('set-open', (_e, open) => cb(open)),
  onCopied: (cb) => ipcRenderer.on('photo-copied', (_e, ok) => cb(ok))
})
