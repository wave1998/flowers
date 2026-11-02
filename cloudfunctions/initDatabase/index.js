// 图片在部署前准备；高清图和缩略图分开上传，兼容 3 秒执行限制。
const cloud = require('wx-server-sdk')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const seed = require('./seed.json')
const images = require('./images/manifest.json')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event = {}) => {
  const db = cloud.database()
  if (event.action === 'prepare') {
    const missing = seed.filter(flower => flower.imageQuery && (!images[flower.name] || !images[flower.name].thumbnailFile || images[flower.name].assetVersion !== 2))
    if (missing.length) {
      return { success: false, message: `配图尚未准备：${missing.map(f => f.name).join('、')}。请先准备高清图与缩略图并重新部署。` }
    }
    // 集合创建单独调用，不与图片上传共用一次函数执行时间。
    for (const name of ['flowers', 'favorites']) {
      try {
        await db.createCollection(name)
      } catch (error) {
        if (!/already exist|collection exist|DATABASE_COLLECTION_EXIST|ResourceExist|集合已存在/i.test(error.errMsg || error.message || '')) throw error
      }
    }
    return { success: true, prepared: true }
  }

  const cursor = event.cursor === undefined ? 0 : event.cursor
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > seed.length) {
    return { success: false, imported: 0, message: '无效的导入游标，请从头重试' }
  }
  if (cursor === seed.length) {
    return { success: true, imported: 0, remaining: 0, nextCursor: cursor, failures: [] }
  }

  const flower = seed[cursor]
  const variant = event.variant || 'image'
  if (variant !== 'image' && variant !== 'thumbnail') return { success: false, message: '无效的图片类型' }
  const collection = db.collection('flowers')
  // 读取失败需终止，不能当成空库继续写入。按名字兼容旧版已导入的数据。
  const { data: existing } = await collection.where({ name: flower.name }).limit(1).get()
  const current = existing[0]
  // 新增的花语文字条目不借用其他物种的照片，使用明确标注的通用插画。
  if (!images[flower.name]) {
    const id = (current && current._id) || `flower_${crypto.createHash('sha1').update(flower.name).digest('hex')}`
    const data = { ...flower, image: '/images/flower-placeholder.png', thumbnail: '/images/flower-placeholder.png', imagePlaceholder: true, catalogVersion: 3 }
    try {
      if (current) await collection.doc(id).update({ data })
      else await collection.doc(id).set({ data: { ...data, createdAt: db.serverDate() } })
      return { success: true, imported: current ? 0 : 1, remaining: seed.length - cursor - 1, nextCursor: cursor + 1, failures: [] }
    } catch (error) { return { success: false, imported: 0, message: `${flower.name}：写入失败，请重试`, failures: [] } }
  }
  const versionField = variant === 'image' ? 'imageVersion' : 'thumbnailVersion'
  const needsUpload = !current || !current[variant] || current[versionField] !== 2
  let imported = 0
  let needsThumbnail = false
  const failures = []
  if (needsUpload) {
    try {
      const image = images[flower.name]
      if (!image || !image.thumbnailFile || image.assetVersion !== 2) throw new Error('缺少高清图或缩略图，请重新准备图片并部署')
      if (variant === 'thumbnail' && (!current || !current.image || current.imageVersion !== 2)) throw new Error('请先导入此花卉的高清图')
      const buffer = fs.readFileSync(path.join(__dirname, 'images', variant === 'thumbnail' ? image.thumbnailFile : image.file))
      const id = (current && current._id) || `flower_${crypto.createHash('sha1').update(flower.name).digest('hex')}`
      const uploaded = await cloud.uploadFile({ cloudPath: `flowers/${variant === 'image' ? 'hd' : 'thumbs'}/${id}.jpg`, fileContent: buffer })
      const { imageQuery, ...info } = flower
      const data = variant === 'thumbnail' ? {
        thumbnail: uploaded.fileID,
        thumbnailVersion: 2
      } : {
          ...info,
          image: uploaded.fileID,
          imageVersion: 2,
          imgRatio: Math.min(Math.max(image.height / image.width, 0.6), 1.6),
          imageMeta: {
            source: image.source, title: image.title, license: image.license,
            author: image.author, sourceUrl: image.sourceUrl,
            modification: image.modification
          }
      }
      // 已有记录只更新字段，保留文档 ID、收藏关联和创建时间。
      if (current) await collection.doc(id).update({ data })
      else await collection.doc(id).set({ data: { ...data, createdAt: db.serverDate() } })
      imported = variant === 'thumbnail' ? 1 : 0
      needsThumbnail = variant === 'image'
    } catch (error) {
      console.error(`导入 ${flower.name} 失败`, error)
      failures.push(`${flower.name}: ${error.message}`)
    }
  } else if (variant === 'image') {
    // 资料更新与配图版本分开：补充赠送建议无需再次上传图片。
    if (JSON.stringify(current.giftRecipients) !== JSON.stringify(flower.giftRecipients) ||
        JSON.stringify(current.giftOccasions) !== JSON.stringify(flower.giftOccasions)) {
      await collection.doc(current._id).update({ data: {
        giftRecipients: flower.giftRecipients || [],
        giftOccasions: flower.giftOccasions || []
      } })
    }
    needsThumbnail = !current.thumbnail || current.thumbnailVersion !== 2
  }
  const nextCursor = needsThumbnail ? cursor : cursor + 1
  return { success: true, imported, remaining: seed.length - nextCursor, nextCursor, failures, needsThumbnail }
}
