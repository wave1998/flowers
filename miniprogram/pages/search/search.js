const api = require('../../utils/cloud')
const { debounce } = require('../../utils/util')

const HISTORY_KEY = 'hyt_search_history'

Page({
  data: {
    keyword: '',
    results: [],
    searched: false,
    loading: false,
    history: [],
    suggests: ['玫瑰', '向日葵', '樱花', '薰衣草', '梅花', '思念', '纯洁', '母爱']
  },

  onLoad() {
    try {
      this.setData({ history: wx.getStorageSync(HISTORY_KEY) || [] })
    } catch (e) {}

    this._debouncedSearch = debounce(() => {
      const kw = this.data.keyword.trim()
      if (kw) this.doSearch(kw)
    }, 400)
  },

  onInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    if (!keyword.trim()) {
      this.setData({ searched: false, results: [] })
      return
    }
    this._debouncedSearch()
  },

  onSearch() {
    const kw = this.data.keyword.trim()
    if (kw) this.doSearch(kw)
  },

  onHistoryTap(e) {
    const word = e.currentTarget.dataset.word
    this.setData({ keyword: word })
    this.doSearch(word)
  },

  async doSearch(kw) {
    this.setData({ loading: true, searched: true })
    try {
      const results = await api.searchFlowers(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      this.setData({ results, loading: false })
      this.saveHistory(kw)
    } catch (err) {
      console.error('搜索失败', err)
      this.setData({ results: [], loading: false })
    }
  },

  saveHistory(kw) {
    let history = this.data.history.filter(w => w !== kw)
    history.unshift(kw)
    history = history.slice(0, 10)
    this.setData({ history })
    try {
      wx.setStorageSync(HISTORY_KEY, history)
    } catch (e) {}
  },

  clearHistory() {
    this.setData({ history: [] })
    try {
      wx.removeStorageSync(HISTORY_KEY)
    } catch (e) {}
  },

  onClear() {
    this.setData({ keyword: '', searched: false, results: [] })
  },

  onCancel() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/index/index' })
    })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  }
})
