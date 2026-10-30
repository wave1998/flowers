// 云数据库操作封装
const { dailyIndex } = require('./util')

const FLOWERS = 'flowers'
const FAVORITES = 'favorites'

function db() {
  return wx.cloud.database()
}

function cmd() {
  return wx.cloud.database().command
}

/** 获取今日推荐的花 */
async function getDailyFlower() {
  const col = db().collection(FLOWERS)
  const { total } = await col.count()
  if (!total) return null
  const idx = dailyIndex(total)
  const { data } = await col.skip(idx).limit(1).orderBy('name', 'asc').get()
  return data[0] || null
}

/** 分页获取花列表（瀑布流用，带图片宽高比） */
async function getFlowers(page = 0, pageSize = 20) {
  const { data } = await db()
    .collection(FLOWERS)
    .orderBy('name', 'asc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get()
  return data
}

async function getFlowerCount() {
  const { total } = await db().collection(FLOWERS).count()
  return total
}

/** 按 id 获取详情 */
async function getFlowerById(id) {
  const { data } = await db().collection(FLOWERS).doc(id).get()
  return data
}

/** 关键词搜索：名称 / 英文名 / 别名 / 花语 / 标签 */
async function searchFlowers(keyword) {
  const $ = cmd()
  const reg = db.RegExp({ regexp: keyword, options: 'i' })
  const { data } = await db()
    .collection(FLOWERS)
    .where(
      $.or([
        { name: reg },
        { nameEn: reg },
        { alias: reg },
        { meaning: reg },
        { tags: reg }
      ])
    )
    .limit(50)
    .get()
  return data
}

/** 是否已收藏 */
async function isFavorite(flowerId) {
  const { total } = await db()
    .collection(FAVORITES)
    .where({ flowerId })
    .count()
  return total > 0
}

/** 切换收藏状态，返回切换后是否已收藏 */
async function toggleFavorite(flower) {
  const col = db().collection(FAVORITES)
  const { data } = await col.where({ flowerId: flower._id }).get()
  if (data.length) {
    await col.doc(data[0]._id).remove()
    return false
  }
  await col.add({
    data: {
      flowerId: flower._id,
      name: flower.name,
      meaning: flower.meaning,
      image: flower.image,
      imgRatio: flower.imgRatio || 1,
      createdAt: db().serverDate()
    }
  })
  return true
}

/** 按收藏记录 id 删除收藏 */
async function removeFavorite(favId) {
  await db().collection(FAVORITES).doc(favId).remove()
}

/** 我的收藏列表（按收藏时间倒序） */
async function getFavorites() {
  const { data } = await db()
    .collection(FAVORITES)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get()
  return data
}

/**
 * 调用云函数初始化数据库（导入花卉数据与图片）。
 * 云函数每次处理一小批，这里循环调用直到全部导入完成。
 * @param {Function} onProgress (imported, remaining) => void 进度回调
 */
async function initDatabase(onProgress) {
  let totalImported = 0
  let failures = []
  for (let i = 0; i < 30; i++) {
    const res = await wx.cloud.callFunction({ name: 'initDatabase' })
    const r = res.result || {}
    totalImported += r.imported || 0
    if (Array.isArray(r.failures)) failures = failures.concat(r.failures)
    if (onProgress) onProgress(totalImported, r.remaining || 0)
    if (!r.success) {
      return { success: false, imported: totalImported, message: r.message || '云函数返回失败', failures }
    }
    if (!r.remaining) break
  }
  return { success: true, imported: totalImported, remaining: 0, failures }
}

module.exports = {
  getDailyFlower,
  getFlowers,
  getFlowerCount,
  getFlowerById,
  searchFlowers,
  isFavorite,
  toggleFavorite,
  removeFavorite,
  getFavorites,
  initDatabase
}
