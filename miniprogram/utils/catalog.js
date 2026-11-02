// 随包附带的公开资料，首屏和详情文字不等待网络。
const flowers = require('../data/flowers')
const byId = new Map(flowers.map(f => [f._id, f]))
const ordered = flowers.slice().sort((a, b) => Number(!!a.imagePlaceholder) - Number(!!b.imagePlaceholder) || a.name.localeCompare(b.name, 'zh-CN'))
function get(id) { return byId.get(id) || null }
function page(index = 0, size = 20) { return ordered.slice(index * size, (index + 1) * size) }
function search(keyword) {
  const value = keyword.trim().toLocaleLowerCase()
  if (!value) return []
  return ordered.filter(f => [f.name, f.nameEn, f.alias, f.meaning, ...(f.tags || [])].some(s => String(s || '').toLocaleLowerCase().includes(value)))
}
module.exports = { flowers, get, page, search, count: flowers.length }
