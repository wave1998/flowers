const api = require('../../utils/cloud')

const PAGE_SIZE = 20
const COL_WIDTH = 343 // rpx，单列图片宽度（750 - 24*2 页边距 - 16 列间距）/ 2
const BODY_HEIGHT = 118 // rpx，卡片文字区域大致高度

Page({
  data: {
    flowers: [],
    leftCol: [],
    rightCol: [],
    total: 0,
    loading: false,
    noMore: false,
    isEmpty: false
  },

  onLoad() {
    this._page = 0
    this._heights = [0, 0] // 两列累计高度，用于瀑布流分配
    this.loadTotal()
    this.loadMore()
  },

  onReachBottom() {
    if (!this.data.noMore && !this.data.loading) this.loadMore()
  },

  onPullDownRefresh() {
    this._page = 0
    this._heights = [0, 0]
    this.setData({ flowers: [], leftCol: [], rightCol: [], noMore: false })
    this.loadTotal()
    this.loadMore().finally(() => wx.stopPullDownRefresh())
  },

  async loadTotal() {
    try {
      const total = await api.getFlowerCount()
      this.setData({ total, isEmpty: total === 0 })
    } catch (e) {
      console.error(e)
    }
  },

  async loadMore() {
    this.setData({ loading: true })
    try {
      const batch = await api.getFlowers(this._page, PAGE_SIZE)
      if (!batch.length) {
        this.setData({ loading: false, noMore: true, isEmpty: this.data.flowers.length === 0 })
        return
      }
      this._page += 1

      const leftCol = this.data.leftCol.slice()
      const rightCol = this.data.rightCol.slice()

      batch.forEach(raw => {
        const ratio = raw.imgRatio || 1
        // 图片显示高度：限制在合理范围内，避免过长/过扁
        const imgHeight = Math.min(Math.max(COL_WIDTH * ratio, 240), 520)
        const item = { ...raw, boxHeight: Math.round(imgHeight) }
        // 放进当前更矮的一列
        if (this._heights[0] <= this._heights[1]) {
          leftCol.push(item)
          this._heights[0] += imgHeight + BODY_HEIGHT
        } else {
          rightCol.push(item)
          this._heights[1] += imgHeight + BODY_HEIGHT
        }
      })

      this.setData({
        flowers: this.data.flowers.concat(batch),
        leftCol,
        rightCol,
        loading: false,
        noMore: this.data.flowers.length + batch.length >= this.data.total && batch.length < PAGE_SIZE
      })
    } catch (err) {
      console.error('加载列表失败', err)
      this.setData({ loading: false, isEmpty: this.data.flowers.length === 0 })
      wx.showToast({ title: '加载失败，请确认数据已初始化', icon: 'none' })
    }
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  }
})
