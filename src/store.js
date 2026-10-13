'use strict'

const fs = require('fs')

class Store {
  constructor(file) {
    this.file = file
    this.data = {
      settings: {
        lineEnabled: true,
        moveScreenshots: false,
        screenshotDir: null,
        maxPhotos: 100
      },
      photos: []
    }
    try {
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (raw && typeof raw === 'object') {
          this.data.settings = Object.assign(this.data.settings, raw.settings || {})
          this.data.photos = Array.isArray(raw.photos) ? raw.photos : []
        }
      }
    } catch (e) {}
    this._timer = null
  }

  save() {
    if (this._timer) return
    this._timer = setTimeout(() => {
      this._timer = null
      try {
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2))
      } catch (e) {}
    }, 300)
  }

  addPhoto(p) {
    this.data.photos.unshift(p)
    const max = this.data.settings.maxPhotos || 100
    if (this.data.photos.length > max) this.data.photos.length = max
    this.save()
  }

  removePhoto(id) {
    this.data.photos = this.data.photos.filter((p) => p.id !== id)
    this.save()
  }

  clear() {
    this.data.photos = []
    this.save()
  }
}

module.exports = Store
