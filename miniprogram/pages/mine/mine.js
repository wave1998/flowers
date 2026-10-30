const api = require('../../utils/cloud')

const STORAGE_KEY = 'hyt_profile'

Page({
  data: {
    avatarUrl: '', // 为空时显示默认 emoji 头像
    nickname: '',
    favorites: [],
    favMeanings: 0,
    loading: true
  },

  onLoad() {
    // 读取本地保存的头像昵称
    try {
      const profile = wx.getStorageSync(STORAGE_KEY)
      if (profile) {
        this.setData({
          avatarUrl: profile.avatarUrl || '',
          nickname: profile.nickname || ''
        })
      }
    } catch (e) {}
  },

  onShow() {
    this.loadFavorites()
  },

  async loadFavorites() {
    this.setData({ loading: true })
    try {
      const favorites = await api.getFavorites()
      const meanings = new Set(favorites.map(f => f.meaning)).size
      this.setData({ favorites, favMeanings: meanings, loading: false })
    } catch (err) {
      console.error('加载收藏失败', err)
      this.setData({ loading: false })
    }
  },

  saveProfile(patch) {
    const profile = {
      avatarUrl: this.data.avatarUrl,
      nickname: this.data.nickname,
      ...patch
    }
    try {
      wx.setStorageSync(STORAGE_KEY, profile)
    } catch (e) {}
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    this.setData({ avatarUrl })
    this.saveProfile({ avatarUrl })
  },

  onNicknameBlur(e) {
    const nickname = (e.detail.value || '').trim()
    this.setData({ nickname })
    this.saveProfile({ nickname })
  },

  onLongPress(e) {
    const { name, favid } = e.currentTarget.dataset
    wx.showActionSheet({
      itemList: [`取消收藏「${name}」`],
      success: async res => {
        if (res.tapIndex === 0) {
          try {
            await api.removeFavorite(favid)
            wx.showToast({ title: '已取消收藏', icon: 'none' })
            this.loadFavorites()
          } catch (err) {
            console.error(err)
          }
        }
      }
    })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  goList() {
    wx.switchTab({ url: '/pages/list/list' })
  }
})
