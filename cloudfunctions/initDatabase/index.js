// 云函数：initDatabase
// 一键初始化花语亭数据库：
// 1. 创建 flowers / favorites 集合
// 2. 按 seed.json 中的花卉资料，从 Wikimedia Commons 搜索并下载自由版权图片
// 3. 图片上传到云存储 flowers/ 目录，文档写入 flowers 集合
//
// 幂等：已存在的（按 name 判断）会跳过，可放心重复调用。
// 每次调用最多处理 BATCH_SIZE 种花，返回 remaining，客户端循环调用直至为 0。
// 建议在云开发控制台把本函数超时时间调到 60s。

const cloud = require('wx-server-sdk')
const axios = require('axios')
const seed = require('./seed.json')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const BATCH_SIZE = 5 // 单次调用最多导入的花卉数量
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
const UA = 'HuaYuTing-MiniProgram/1.0 (contact: personal project; educational use)'

/** 判断许可证是否足够自由（排除 NC 等非商业限制） */
function isFreeLicense(extmetadata) {
  if (!extmetadata) return false
  const license = ((extmetadata.LicenseShortName || {}).value || '').toLowerCase()
  if (!license) return false
  if (license.includes('noncommercial') || license.includes('nc')) return false
  return (
    license.includes('public domain') ||
    license.includes('cc0') ||
    license.includes('cc by') ||
    license.includes('gnu')
  )
}

/** 在 Commons 搜索一张合适的自由版权图片，返回 { url, width, height } 或 null */
async function findImage(query) {
  try {
    const resp = await axios.get(COMMONS_API, {
      headers: { 'User-Agent': UA },
      timeout: 15000,
      params: {
        action: 'query',
        format: 'json',
        generator: 'search',
        gsrsearch: `${query} filetype:bitmap`,
        gsrnamespace: 6,
        gsrlimit: 10,
        prop: 'imageinfo',
        iiprop: 'url|size|mime|extmetadata',
        iiurlwidth: 750
      }
    })
    const pages = (resp.data.query && resp.data.query.pages) || {}
    const candidates = Object.values(pages).filter(p => {
      const ii = p.imageinfo && p.imageinfo[0]
      if (!ii) return false
      if (ii.mime !== 'image/jpeg') return false
      if (!ii.width || ii.width < 600) return false
      return isFreeLicense(ii.extmetadata)
    })
    if (!candidates.length) return null

    // 相关性排序（generator 返回 index），标题含 query 关键词的优先
    candidates.sort((a, b) => (a.index || 99) - (b.index || 99))
    const chosen = candidates[0]
    const ii = chosen.imageinfo[0]
    return {
      url: ii.thumburl || ii.url,
      width: ii.width,
      height: ii.height,
      title: chosen.title,
      license: ii.extmetadata.LicenseShortName.value,
      author: (ii.extmetadata.Artist || {}).value || ''
    }
  } catch (err) {
    console.error('搜索图片失败:', query, err.message)
    return null
  }
}

/** 下载图片 */
async function downloadImage(url) {
  const resp = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 30000,
    responseType: 'arraybuffer',
    maxContentLength: 10 * 1024 * 1024
  })
  return Buffer.from(resp.data)
}

exports.main = async () => {
  const db = cloud.database()

  // 1. 确保集合存在
  for (const name of ['flowers', 'favorites']) {
    try {
      await db.createCollection(name)
    } catch (e) {
      // 已存在时忽略
    }
  }

  const flowersCol = db.collection('flowers')

  // 2. 找出尚未导入的花
  let existing = []
  try {
    const countRes = await flowersCol.count()
    const total = countRes.total
    for (let i = 0; i < total; i += 100) {
      const res = await flowersCol.skip(i).limit(100).field({ name: true }).get()
      existing = existing.concat(res.data.map(d => d.name))
    }
  } catch (e) {
    console.error('读取现有数据失败', e)
  }
  const pending = seed.filter(f => !existing.includes(f.name))
  if (!pending.length) {
    return { success: true, imported: existing.length, remaining: 0, message: '所有花卉数据已导入完成' }
  }

  // 3. 处理一批
  const batch = pending.slice(0, BATCH_SIZE)
  let imported = 0
  const failures = []

  for (const flower of batch) {
    try {
      const idx = seed.findIndex(s => s.name === flower.name)
      const img = await findImage(flower.imageQuery)
      if (!img) {
        failures.push(`${flower.name}: 未找到合适的自由版权图片`)
        continue
      }
      const buffer = await downloadImage(img.url)
      const ext = 'jpg'
      const uploadRes = await cloud.uploadFile({
        cloudPath: `flowers/flower_${idx}.${ext}`,
        fileContent: buffer
      })

      // 缩略图显示比例（用于瀑布流布局），限制在合理范围
      const rawRatio = img.height / img.width
      const imgRatio = Math.min(Math.max(rawRatio, 0.6), 1.6)

      await flowersCol.add({
        data: {
          name: flower.name,
          nameEn: flower.nameEn,
          latin: flower.latin,
          alias: flower.alias,
          family: flower.family,
          origin: flower.origin,
          bloomSeason: flower.bloomSeason,
          colors: flower.colors,
          meaning: flower.meaning,
          tags: flower.tags,
          legend: flower.legend,
          description: flower.description,
          care: flower.care,
          image: uploadRes.fileID,
          imgRatio,
          imageMeta: {
            source: 'Wikimedia Commons',
            title: img.title,
            license: img.license,
            author: img.author
          },
          createdAt: db.serverDate()
        }
      })
      imported++
    } catch (err) {
      console.error(`导入 ${flower.name} 失败`, err)
      failures.push(`${flower.name}: ${err.message}`)
    }
  }

  const remaining = pending.length - batch.length
  return {
    success: true,
    imported,
    remaining,
    failures,
    message: remaining > 0 ? `本批导入 ${imported} 种，还剩 ${remaining} 种` : '全部导入完成'
  }
}
