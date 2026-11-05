// 云图加载失败时显示随包占位图；限制路径来源，避免重复触发。
const PLACEHOLDER = '/images/flower-placeholder.png'
function onThumbnailError(e) {
  const { field, index } = e.currentTarget.dataset
  const allowed = ['daily', 'hot', 'leftCol', 'rightCol', 'results', 'favorites']
  if (!allowed.includes(field)) return
  const path = field === 'daily' ? 'daily.thumbnail' : `${field}[${Number(index)}].thumbnail`
  const item = field === 'daily' ? this.data.daily : (this.data[field] || [])[Number(index)]
  const fallback = item && item.fallbackThumbnail || PLACEHOLDER
  if (item && item.thumbnail !== fallback) this.setData({ [path]: fallback })
}
module.exports = { onThumbnailError }
