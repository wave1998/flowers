const api = require('../../utils/cloud')

Page({
  data: {
    flower: null,
    faved: false
  },

  onLoad(options) {
    this._id = options.id
    this.loadFlower()
  },

  async loadFlower() {
    try {
      const raw = await api.getFlowerById(this._id)
      if (!raw) {
        wx.showToast({ title: '未找到这朵花', icon: 'none' })
        return
      }
      const flower = {
        ...raw,
        colors: raw.colors || [],
        colorsText: (raw.colors || []).join(' / '),
        tags: raw.tags || [],
        paragraphs: (raw.description || '')
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean)
      }
      this.setData({ flower })
      wx.setNavigationBarTitle({ title: flower.name })

      const faved = await api.isFavorite(this._id)
      this.setData({ faved })
    } catch (err) {
      console.error('加载详情失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async onToggleFav() {
    if (!this.data.flower) return
    try {
      const faved = await api.toggleFavorite(this.data.flower)
      this.setData({ faved })
      wx.showToast({ title: faved ? '已收入花囊 ♥' : '已取消收藏', icon: 'none' })
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '操作失败，请检查登录状态', icon: 'none' })
    }
  },

  previewImage() {
    if (this.data.flower) {
      wx.previewImage({ urls: [this.data.flower.image] })
    }
  },

  onShareAppMessage() {
    const f = this.data.flower
    if (!f) return { title: '花语亭' }
    return {
      title: `${f.name}的花语是「${f.meaning}」—— 花语亭`,
      path: `/pages/detail/detail?id=${f._id}`,
      imageUrl: f.image
    }
  },

  onShareTimeline() {
    const f = this.data.flower
    if (!f) return {}
    return {
      title: `${f.name} · 花语亭`,
      query: `id=${f._id}`,
      imageUrl: f.image
    }
  }
})
