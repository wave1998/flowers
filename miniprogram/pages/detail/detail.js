const api = require('../../utils/cloud')
const auth = require('../../utils/auth')
Page({
  data: { flower: null, faved: false, favBusy: false, loading: true, error: '', imageLoaded: false, imageFailed: false, previewSrc: '' },
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
  onUnload() { this._destroyed = true; clearTimeout(this._timer); clearTimeout(this._imageTimer) },
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
    const original = flower.originalImage || (this.data.imageFailed ? flower.thumbnail : flower.image) || flower.thumbnail
    if (!original) { wx.showToast({ title: '图片暂不可预览', icon: 'none' }); return }
    // 代码包图片在部分微信环境中不能直接交给系统预览，使用 image 组件展示。
    if (original.startsWith('/')) { this.setData({ previewSrc: original }); return }
    wx.previewImage({ current: original, urls: [original], showmenu: true,
      fail: () => { if (!this._destroyed) this.setData({ previewSrc: flower.thumbnail || flower.image }) } })
  },
  closePreview() { this.setData({ previewSrc: '' }) },
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
