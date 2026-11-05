// 云数据库操作封装
const { dailyIndex } = require('./util')
const catalog = require('./catalog')
const auth = require('./auth')
const detailCache = new Map()
const inFlight = new Map()

const FLOWERS = 'flowers'
const FAVORITES = 'favorites'

function requireCloud() {
  if (!wx.cloud) {
    const error = new Error('当前基础库不支持云开发')
    error.code = 'CLOUD_UNAVAILABLE'
    throw error
  }
  return wx.cloud
}

function db() {
  return requireCloud().database()
}

/** 公开资料本地读取，避免首屏多次 count / skip 请求。 */
async function getDailyFlower() {
  const photos = catalog.flowers.filter(f => !f.imagePlaceholder)
  return photos[dailyIndex(photos.length)] || null
}
async function getFlowers(page = 0, pageSize = 20) { return catalog.page(page, pageSize) }
async function getFlowerCount() { return catalog.count }
function getCachedFlowerById(id) { return detailCache.get(id) || catalog.get(id) }
async function getFlowerById(id) {
  const cached = getCachedFlowerById(id)
  if (cached) return cached
  return refreshFlowerById(id)
}
// 云端只刷新当前详情的配图；重复打开去重，10 分钟内不再请求。
function refreshFlowerById(id) {
  const cached = detailCache.get(id)
  if (cached && Date.now() - cached._cachedAt < 600000) return Promise.resolve(cached)
  if (inFlight.has(id)) return inFlight.get(id)
  const request = db().collection(FLOWERS).doc(id).get().then(({ data }) => {
    if (!data) return catalog.get(id)
    const local = catalog.get(id)
    const flower = local ? { ...data, ...local,
      image: data.imageVersion === 2 && local.imageKind !== 'ai-illustration' ? data.image : local.image,
      imagePlaceholder: !!local.imagePlaceholder,
      // 使用本地目录登记的缩略图（可为云文件）。
      thumbnail: local.thumbnail,
      imageMeta: data.imageVersion === 2 && local.imageKind !== 'ai-illustration' ? data.imageMeta : local.imageMeta
    } : data
    if (!flower) return null
    const result = { ...flower, _cachedAt: Date.now() }
    detailCache.set(id, result)
    // 非公开花卉资料也限定缓存条数。
    if (detailCache.size > 80) detailCache.delete(detailCache.keys().next().value)
    return result
  }).finally(() => { inFlight.delete(id) })
  inFlight.set(id, request)
  return request
}
async function searchFlowers(keyword) { return catalog.search(keyword) }
function requireLogin() {
  if (!auth.isLoggedIn()) throw new Error('请先登录后收藏')
}

/** 是否已收藏 */
async function isFavorite(flowerId) {
  if (!auth.isLoggedIn()) return false
  const flower = catalog.get(flowerId)
  const ids = flower ? [flower._id, ...(flower.legacyIds || [])] : [flowerId]
  for (const id of ids) {
    const { total } = await db().collection(FAVORITES).where({ flowerId: id }).count()
    if (total > 0) return true
  }
  return false
}

/** 切换收藏状态，返回切换后是否已收藏 */
async function toggleFavorite(flower) {
  requireLogin()
  const col = db().collection(FAVORITES)
  const ids = [flower._id, ...(flower.legacyIds || [])]
  const records = []
  for (const id of ids) {
    const { data } = await col.where({ flowerId: id }).get()
    records.push(...data)
  }
  if (records.length) {
    for (const record of records) await col.doc(record._id).remove()
    return false
  }
  await col.add({
    data: {
      flowerId: flower._id,
      name: flower.name,
      meaning: flower.meaning,
      image: flower.image,
      thumbnail: flower.thumbnail || flower.image,
      imgRatio: flower.imgRatio || 1,
      createdAt: db().serverDate()
    }
  })
  return true
}

/** 按收藏记录 id 删除收藏 */
async function removeFavorite(favId) {
  requireLogin()
  await db().collection(FAVORITES).doc(favId).remove()
}

/** 我的收藏列表（按收藏时间倒序） */
async function getFavorites() {
  if (!auth.isLoggedIn()) return []
  const { data } = await db()
    .collection(FAVORITES)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get()
  return data.map(record => {
    const flower = catalog.get(record.flowerId)
    return flower ? { ...record, thumbnail: flower.thumbnail, image: flower.image } : record
  })
}

/**
 * 调用云函数初始化数据库（导入花卉数据与图片）。
 * 云函数每次处理一小批，这里循环调用直到全部导入完成。
 * @param {Function} onProgress (imported, remaining) => void 进度回调
 */
async function initDatabase(onProgress) {
  const cloud = requireCloud()
  const setup = await cloud.callFunction({ name: 'initDatabase', data: { action: 'prepare' } })
  if (!setup.result || !setup.result.success || !setup.result.prepared) {
    return { success: false, imported: 0, failures: [], message: (setup.result && setup.result.message) || '初始化函数版本不匹配，请重新部署 initDatabase' }
  }
  let totalImported = 0
  let failures = []
  let cursor = 0
  let previousRemaining = null
  for (let i = 0; i < 1000; i++) {
    const res = await cloud.callFunction({ name: 'initDatabase', data: { cursor } })
    let r = res.result || {}
    if (r.success && r.needsThumbnail) {
      const thumbnail = await cloud.callFunction({ name: 'initDatabase', data: { cursor, variant: 'thumbnail' } })
      const result = thumbnail.result || {}
      r = { ...result, imported: (r.imported || 0) + (result.imported || 0), failures: (r.failures || []).concat(result.failures || []) }
    }
    if (Number.isInteger(r.imported) && r.imported >= 0) totalImported += r.imported
    if (Array.isArray(r.failures)) failures = failures.concat(r.failures)
    if (!r.success) {
      return { success: false, imported: totalImported, message: r.message || '云函数返回失败', failures }
    }
    if (!Number.isInteger(r.remaining) || r.remaining < 0) {
      return { success: false, imported: totalImported, message: '云函数返回的进度无效，请重新部署 initDatabase', failures }
    }
    if (onProgress) onProgress(totalImported, r.remaining)
    if (r.remaining === 0) {
      return { success: true, imported: totalImported, remaining: 0, failures }
    }
    if (Number.isInteger(r.nextCursor) && r.nextCursor > cursor) {
      cursor = r.nextCursor
    } else if (r.nextCursor === undefined && (previousRemaining === null || r.remaining < previousRemaining)) {
      // 兼容旧版云函数；没有进展时必须退出，避免重复重试同一批失败项。
    } else {
      return { success: false, imported: totalImported, remaining: r.remaining, failures, message: '导入进度停滞，请重新部署 initDatabase 后重试' }
    }
    previousRemaining = r.remaining
  }
  return { success: false, imported: totalImported, failures, message: '本次导入达到批次上限，请重试以继续导入' }
}

module.exports = {
  getDailyFlower,
  getFlowers,
  getFlowerCount,
  getFlowerById,
  getCachedFlowerById,
  refreshFlowerById,
  searchFlowers,
  isFavorite,
  toggleFavorite,
  removeFavorite,
  getFavorites,
  initDatabase
}
