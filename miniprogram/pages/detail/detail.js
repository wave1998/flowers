const api = require('../../utils/cloud')
const auth = require('../../utils/auth')
Page({
  data: { flower: null, faved: false, favBusy: false, loading: true, error: '', imageLoaded: false, imageFailed: false, previewSrc: '', previewPreparing: false, savingImage: false },
  onLoad(options) {
    this._id = options.id
    const cached = api.getCachedFlowerById(this._id)
    if (cached) this.showFlower(cached)
    this.loadFlower()
  },
  async onShow() {
    await auth.restore()
    if (this._destroyed) return
    if (this._pendingFavorite) {
      this._pendingFavorite = false
      if (auth.isLoggedIn()) {
        // 重新确认当前状态，再幂等地恢复“收藏”，避免登录返回后反向取消。
        try {
          const exists = await api.isFavorite(this._id)
          if (this._destroyed) return
          if (exists) this.setData({ faved: true })
          else await this.onToggleFav()
        } catch (_) { wx.showToast({ title: '收藏未完成，请重试', icon: 'none' }) }
      }
      return
    }
    this.refreshFavorite()
  },
  onUnload() { this._destroyed = true; this._previewGeneration = (this._previewGeneration || 0) + 1; clearTimeout(this._timer); clearTimeout(this._imageTimer) },
  showFlower(raw) {
    if (this._destroyed) return
    const previous = this.data.flower
    const flower = { ...raw, colors: raw.colors || [], colorsText: (raw.colors || []).join(' / '), tags: raw.tags || [],
      giftRecipientsText: (raw.giftRecipients || []).join('、'),
      giftOccasionsText: (raw.giftOccasions || []).join('、'),
      paragraphs: (raw.description || '').split('\n').map(s => s.trim()).filter(Boolean) }
    const patch = { flower, loading: false, error: '' }
    if (!previous || previous.image !== flower.image) Object.assign(patch, { imageLoaded: false, imageFailed: false })
    this.setData(patch)
    if ((!previous || previous.image !== flower.image) && !flower.imagePlaceholder) {
      clearTimeout(this._imageTimer)
      this._imageTimer = setTimeout(() => { if (!this._destroyed && !this.data.imageLoaded) this.setData({ imageFailed: true }) }, 12000)
    }
    wx.setNavigationBarTitle({ title: flower.name })
  },
  async loadFlower() {
    this.setData({ error: '', loading: !this.data.flower })
    clearTimeout(this._timer)
    this._timer = setTimeout(() => {
      if (!this._destroyed && !this.data.flower) this.setData({ loading: false, error: '加载较慢，请检查网络后重试' })
    }, 6000)
    try {
      const raw = await api.getFlowerById(this._id)
      if (raw) this.showFlower(raw)
      else if (!this._destroyed) this.setData({ loading: false, error: '没有找到这条花卉资料' })
    } catch (_) {
      if (!this._destroyed && !this.data.flower) this.setData({ loading: false, error: '暂时无法加载，请稍后重试' })
    } finally { clearTimeout(this._timer) }
    // 占位插画无需访问云端；照片在后台升级，不阻塞文字和收藏。
    if (!this._destroyed && this.data.flower && !this.data.flower.imagePlaceholder) {
      api.refreshFlowerById(this._id).then(f => { if (f) this.showFlower(f) }).catch(() => {})
    }
  },
  async refreshFavorite() {
    if (!auth.isLoggedIn()) { this.setData({ faved: false }); return }
    try { const faved = await api.isFavorite(this._id); if (!this._destroyed && !this.data.favBusy) this.setData({ faved }) } catch (_) {}
  },
  async onToggleFav() {
    if (!this.data.flower || this.data.favBusy || this._checkingAuth) return
    this._checkingAuth = true
    try { await auth.restore() } finally { this._checkingAuth = false }
    if (this._destroyed) return
    if (!auth.isLoggedIn()) {
      this._pendingFavorite = true
      auth.openAccount('favorite')
      return
    }
    this.setData({ favBusy: true })
    try {
      const faved = await api.toggleFavorite(this.data.flower)
      if (!this._destroyed) this.setData({ faved })
      wx.showToast({ title: faved ? '已收入花囊 ♥' : '已取消收藏', icon: 'none' })
    } catch (_) { wx.showToast({ title: '收藏未完成，请重试', icon: 'none' }) }
    finally { if (!this._destroyed) this.setData({ favBusy: false }) }
  },
  onImageLoad() { clearTimeout(this._imageTimer); this.setData({ imageLoaded: true, imageFailed: false }) },
  onImageError() { clearTimeout(this._imageTimer); this.setData({ imageFailed: true }) },
  onThumbnailError() {
    const flower = this.data.flower
    const fallback = flower && flower.fallbackThumbnail || '/images/flower-placeholder.png'
    if (flower && flower.thumbnail !== fallback) this.setData({ 'flower.thumbnail': fallback })
  },
  retryImage() { this.setData({ imageFailed: false, imageLoaded: false }); this.loadFlower() },
  previewImage() {
    const flower = this.data.flower
    if (!flower || flower.imagePlaceholder) return
    this._previewCandidates = [...new Set([flower.originalImage, flower.image, flower.thumbnail].filter(Boolean))]
    this._previewIndex = 0
    if (!this._previewCandidates.length) { wx.showToast({ title: '图片暂不可预览', icon: 'none' }); return }
    const generation = this._previewGeneration = (this._previewGeneration || 0) + 1
    this.setData({ previewSrc: '/images/flower-loading.png', previewPreparing: true })
    return this.preparePreview(generation)
  },
  getPreviewImageInfo(src) {
    if (!this._previewCache) this._previewCache = new Map()
    if (this._previewCache.has(src)) return this._previewCache.get(src)
    const request = Promise.resolve().then(async () => {
      const local = src.startsWith('cloud://') ? (await wx.cloud.downloadFile({ fileID: src })).tempFilePath : src
      return new Promise((resolve, reject) => wx.getImageInfo({ src: local, success: resolve, fail: reject }))
    }).catch(error => { this._previewCache.delete(src); throw error })
    this._previewCache.set(src, request)
    return request
  },
  async preparePreview(generation) {
    const src = this._previewCandidates[this._previewIndex]
    try {
      const info = await this.getPreviewImageInfo(src)
      if (this._destroyed || generation !== this._previewGeneration) return
      this._previewSource = src
      this.setData({ previewSrc: info.path, previewPreparing: false })
    } catch (_) {
      if (!this._destroyed && generation === this._previewGeneration) return this.onPreviewError()
    }
  },
  onPreviewError() {
    const next = ++this._previewIndex
    if (this._previewSource && this._previewCache) this._previewCache.delete(this._previewSource)
    if (this._previewCandidates && next < this._previewCandidates.length) {
      this.setData({ previewPreparing: true })
      return this.preparePreview(this._previewGeneration)
    }
    else { this.closePreview(); wx.showToast({ title: '图片暂不可预览', icon: 'none' }) }
  },
  closePreview() { this._previewGeneration = (this._previewGeneration || 0) + 1; this._previewCandidates = []; this._previewSource = ''; this.setData({ previewSrc: '', previewPreparing: false }) },
  async saveWatermarkedImage() {
    if (this.data.savingImage || this.data.previewPreparing || !this.data.previewSrc) return
    const src = this._previewSource || this.data.previewSrc
    this.setData({ savingImage: true })
    try {
      const info = await this.getPreviewImageInfo(src)
      const scale = Math.min(1, 2048 / Math.max(info.width, info.height))
      const width = Math.max(1, Math.round(info.width * scale))
      const height = Math.max(1, Math.round(info.height * scale))
      const canvas = await new Promise((resolve, reject) => {
        wx.createSelectorQuery().in(this).select('#watermarkCanvas').fields({ node: true }).exec(result => {
          if (result && result[0] && result[0].node) resolve(result[0].node)
          else reject(new Error('画布尚未准备好'))
        })
      })
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      const image = await new Promise((resolve, reject) => {
        const image = canvas.createImage()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = info.path
      })
      context.drawImage(image, 0, 0, width, height)
      // 预览按屏幕宽度展示时约 12px，导出时按图片尺寸等比绘制。
      const windowWidth = wx.getWindowInfo ? wx.getWindowInfo().windowWidth : wx.getSystemInfoSync().windowWidth
      const fontSize = Math.max(12, Math.round(width * 12 / (windowWidth || 375)))
      const margin = Math.max(10, Math.round(fontSize * 0.8))
      context.font = `${fontSize}px sans-serif`
      context.textAlign = 'right'
      context.textBaseline = 'bottom'
      context.fillStyle = '#ffffff'
      context.shadowOffsetY = 1
      context.shadowBlur = Math.max(2, fontSize / 5)
      context.shadowColor = 'rgba(0, 0, 0, 0.8)'
      context.fillText('花语亭', width - margin, height - margin)
      await new Promise(resolve => canvas.requestAnimationFrame(resolve))
      const result = await new Promise((resolve, reject) => wx.canvasToTempFilePath({ canvas, width, height, destWidth: width, destHeight: height, fileType: 'png', success: resolve, fail: reject }, this))
      await new Promise((resolve, reject) => wx.saveImageToPhotosAlbum({ filePath: result.tempFilePath, success: resolve, fail: reject }))
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (error) {
      if (this._previewCache) this._previewCache.delete(src)
      if (/auth deny|auth denied|authorize|permission/i.test(error.errMsg || '')) {
        wx.showModal({ title: '需要相册权限', content: '允许保存到相册后，即可下载带水印的图片。', confirmText: '去设置', success: result => { if (result.confirm) wx.openSetting() } })
      } else wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally { if (!this._destroyed) this.setData({ savingImage: false }) }
  },
  copyImageSource() {
    const source = this.data.flower && this.data.flower.imageMeta && this.data.flower.imageMeta.sourceUrl
    if (source) wx.setClipboardData({ data: source })
  },
  copyMeaningSource() { const source = this.data.flower.meaningSource; if (source) wx.setClipboardData({ data: source.url }) },
  onShareAppMessage() {
    const f = this.data.flower
    return f ? { title: `${f.name}的花语是「${f.meaning}」—— 花语亭`, path: `/pages/detail/detail?id=${f._id}`, imageUrl: f.thumbnail || f.image } : { title: '花语亭' }
  },
  onShareTimeline() {
    const f = this.data.flower
    return f ? { title: `${f.name} · 花语亭`, query: `id=${f._id}`, imageUrl: f.thumbnail || f.image } : {}
  }
})
