const { onThumbnailError } = require('../../utils/image-fallback')
const api = require('../../utils/cloud')
const auth = require('../../utils/auth')
Page({
  onThumbnailError,
  data: { user: null, avatarUrl: '', nickname: '', favorites: [], favMeanings: 0, loading: true, error: '' },
  async onShow() {
    await auth.restore()
    const user = auth.getUser()
    this.setData({ user, avatarUrl: user ? user.avatarUrl : '', nickname: user ? user.nickname : '' })
    this.loadFavorites()
  },
  async loadFavorites() {
    if (!auth.isLoggedIn()) { this.setData({ favorites: [], favMeanings: 0, loading: false, error: '' }); return }
    this.setData({ loading: true, error: '' })
    try {
      const favorites = await api.getFavorites()
      this.setData({ favorites, favMeanings: new Set(favorites.map(f => f.meaning)).size, loading: false })
    } catch (_) { this.setData({ loading: false, error: '花囊暂时无法加载，请点击重试' }) }
  },
  editAvatar() { auth.openAccount('avatar') },
  editNickname() { auth.openAccount('nickname') },
  editAccount() { auth.openAccount() },
  onLongPress(e) {
    const { name, favid } = e.currentTarget.dataset
    wx.showActionSheet({ itemList: [`取消收藏「${name}」`], success: async res => {
      if (res.tapIndex !== 0) return
      try { await api.removeFavorite(favid); wx.showToast({ title: '已取消收藏', icon: 'none' }); this.loadFavorites() }
      catch (_) { wx.showToast({ title: '取消失败，请重试', icon: 'none' }) }
    } })
  },
  goDetail(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` }) },
  goList() { wx.switchTab({ url: '/pages/list/list' }) }
})
