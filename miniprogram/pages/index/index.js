const api = require('../../utils/cloud')
const { formatDateCN, todayKey } = require('../../utils/util')

Page({
  data: {
    today: '',
    daily: null,
    hot: [],
    loading: true,
    isEmpty: false,
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
    this.setData({ loading: true, initError: '' })
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
      this.setData({ loading: false, isEmpty: true, initError: '加载失败，请检查云开发环境是否已开通、数据是否已初始化' })
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
          title: failed ? `导入 ${result.imported} 种，${failed} 种失败` : `成功导入 ${result.imported} 种花`,
          icon: failed ? 'none' : 'success'
        })
        this._loadedDay = null
        await this.loadData()
      } else {
        this.setData({ initError: (result && result.message) || '初始化失败，请查看云函数日志' })
      }
    } catch (err) {
      console.error(err)
      this.setData({
        initError: '云函数调用失败：请先在 cloudfunctions/initDatabase 上右键「上传并部署」，并确认已开通云开发'
      })
    } finally {
      this.setData({ initializing: false })
    }
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
