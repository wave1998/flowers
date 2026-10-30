// 工具函数
const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 格式化日期为 "2026年10月30日 星期四" */
function formatDateCN(date = new Date()) {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  return `${y}年${m}月${d}日 星期${WEEK_DAYS[date.getDay()]}`
}

/** 今天的字符串 key，如 2026-10-30 */
function todayKey(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

/**
 * 计算"今日推荐"在数据库中的下标：
 * 以当天日期为种子对总数取模，保证同一天所有人看到同一朵花，且每天轮换。
 */
function dailyIndex(total) {
  if (!total) return 0
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now - start) / 86400000)
  // 加上月份/日期扰动，避免相邻天数总是差 1 造成顺序单调
  const seed = dayOfYear * 31 + now.getMonth() * 7
  return seed % total
}

/** 简单防抖 */
function debounce(fn, wait = 400) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}

module.exports = { formatDateCN, todayKey, dailyIndex, debounce }
