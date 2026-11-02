const api = require('../../utils/cloud')
const { formatDateCN, todayKey } = require('../../utils/util')
const { describeCloudError } = require('../../utils/cloud-error')

Page({
  data: {
    today: '',
    daily: null,
    hot: [],
    loading: true,
    isEmpty: false,
    loadError: null,
    initializing: false,
    initError: '',
    initProgressText: ''
  },

  onLoad() {
    this.setData({ today: formatDateCN() })
  },

  onShow() {
    // 每天只加载一次，切换 tab 回来不重复请求
    if (this._loadedDay === todayKey()) return
    this.loadData()
  },

  onPullDownRefresh() {
    this._loadedDay = null
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    this.setData({ loading: true, loadError: null, isEmpty: false })
    try {
      const daily = await api.getDailyFlower()
      if (!daily) {
        this.setData({ isEmpty: true, daily: null, hot: [], loading: false })
        return
      }
      const hot = await this.loadHot(daily)
      this._loadedDay = todayKey()
      this.setData({ daily, hot, isEmpty: false, loading: false })
    } catch (err) {
      console.error('加载首页数据失败', err)
      const error = describeCloudError(err)
      this.setData({
        loading: false,
        isEmpty: !!error.needsInitialization,
        loadError: error.needsInitialization ? null : error,
        daily: null,
        hot: []
      })
    }
  },

  /** 取一批花，按日期伪随机挑 4 朵作为"花间漫步"（排除今日推荐） */
  async loadHot(daily) {
    const list = await api.getFlowers(0, 20)
    const rest = list.filter(f => !daily || f._id !== daily._id)
    if (rest.length <= 4) return rest
    const seed = new Date().getDate() + new Date().getMonth()
    return rest
      .map((item, i) => ({ item, r: (i * 7 + seed * 13) % 17 }))
      .sort((a, b) => a.r - b.r)
      .map(x => x.item)
      .slice(0, 4)
  },

  async onInit() {
    if (this.data.initializing) return
    this.setData({ initializing: true, initError: '', initProgressText: '正在导入花卉数据…' })
    try {
      const result = await api.initDatabase((imported, remaining) => {
        this.setData({
          initProgressText: `已导入 ${imported} 种${remaining ? `，剩余 ${remaining} 种…` : ''}`
        })
      })
      if (result && result.success) {
        const failed = result.failures && result.failures.length
        wx.showToast({
          title: failed ? `导入 ${result.imported} 种，${failed} 种失败` : (result.imported ? `成功导入 ${result.imported} 种花` : '花卉数据已就绪'),
          icon: failed ? 'none' : 'success'
        })
        this._loadedDay = null
        await this.loadData()
        if (failed) {
          this.setData({ initError: `以下花卉未导入，可重试：${result.failures.join('；')}` })
        }
      } else {
        this.setData({ initError: (result && result.message) || '初始化失败，请查看云函数日志' })
      }
    } catch (err) {
      console.error(err)
      const error = describeCloudError(err)
      this.setData({
        initError: [error.title, error.message, error.detail].filter(Boolean).join('：')
      })
    } finally {
      this.setData({ initializing: false })
    }
  },

  onRetry() {
    if (!this.data.loading) return this.loadData()
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' })
  },

  goList() {
    wx.switchTab({ url: '/pages/list/list' })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  }
})
