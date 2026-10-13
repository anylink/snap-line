'use strict'

const api = window.snapLine
const photosEl = document.getElementById('photos')
const trashEl = document.getElementById('trash')
const toastEl = document.getElementById('toast')
const stageEl = document.getElementById('stage')

const elements = new Map()
let dragCtx = null
let toastTimer = null

function fileUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/')
}

function createPhotoEl(p) {
  const wrap = document.createElement('div')
  wrap.className = 'photo new'
  wrap.dataset.id = p.id
  setTimeout(function () { wrap.classList.remove('new') }, 900)

  const dur = (2.4 + Math.random() * 1.8).toFixed(2)
  const delay = (Math.random() * 1.6).toFixed(2)
  const tilt = (Math.random() * 4 - 2).toFixed(2)
  wrap.style.setProperty('--dur', dur + 's')
  wrap.style.setProperty('--delay', delay + 's')
  wrap.style.setProperty('--tilt', tilt + 'deg')

  const pin = document.createElement('div')
  pin.className = 'pin'

  const img = document.createElement('img')
  img.src = fileUrl(p.path)
  img.alt = p.name
  img.draggable = false

  const badge = document.createElement('div')
  badge.className = 'badge'

  wrap.appendChild(pin)
  wrap.appendChild(img)
  wrap.appendChild(badge)

  wrap.addEventListener('click', () => { api.copyPhoto(p.id) })
  wrap.addEventListener('dblclick', () => { api.openPhoto(p.id) })
  wrap.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    e.stopPropagation()
    api.showPhotoMenu(p.id, e.clientX, e.clientY)
  })
  wrap.addEventListener('dragstart', (e) => {
    e.preventDefault()
    dragCtx = { id: p.id, onTrash: false }
    api.startDrag(p.id, p.path)
  })
  wrap.addEventListener('dragend', (e) => {
    if (dragCtx && dragCtx.onTrash) { dragCtx = null; return }
    const outside = e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight
    if (outside && dragCtx) api.photoLeftWindow(dragCtx.id)
    dragCtx = null
  })

  return wrap
}

function render(photos) {
  const seen = new Set()
  for (const p of photos) {
    seen.add(p.id)
    if (!elements.has(p.id)) {
      const el = createPhotoEl(p)
      elements.set(p.id, el)
      photosEl.appendChild(el)
    }
  }
  for (const [id, el] of Array.from(elements)) {
    if (!seen.has(id)) {
      el.remove()
      elements.delete(id)
    }
  }
}

trashEl.addEventListener('dragover', (e) => {
  e.preventDefault()
  trashEl.classList.add('hot')
  if (dragCtx) dragCtx.onTrash = true
})
trashEl.addEventListener('dragleave', () => {
  trashEl.classList.remove('hot')
  if (dragCtx) dragCtx.onTrash = false
})
trashEl.addEventListener('drop', (e) => {
  e.preventDefault()
  trashEl.classList.remove('hot')
  if (dragCtx) {
    dragCtx.onTrash = true
    api.trashPhoto(dragCtx.id)
  }
})

stageEl.addEventListener('click', (e) => {
  if (e.target === stageEl || e.target === photosEl) {
    api.mouseLeftWindow()
  }
})

window.addEventListener('mousemove', (e) => {
  if (e.clientY <= 5) api.hoverTop()
})
window.addEventListener('mouseleave', () => { api.mouseLeftWindow() })

api.onPhotosChanged((photos) => { render(photos) })
api.onSetOpen((open) => {
  stageEl.classList.toggle('open', open)
  trashEl.style.display = open ? 'flex' : 'none'
})
api.onCopied((ok) => {
  if (!ok) return
  toastEl.classList.add('show')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastEl.classList.remove('show') }, 900)
})

api.getPhotos().then((photos) => { render(photos) }).catch(() => {})
