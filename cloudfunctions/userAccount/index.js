const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const CONSENT_VERSION = '2026-11-02'
function publicProfile(record) {
  return { uid: record._id, nickname: record.nickname || '', avatarUrl: record.avatarUrl || '', phoneBound: !!record.phoneNumber,
    phoneMasked: record.phoneNumber ? `${record.phoneNumber.slice(0, 3)}****${record.phoneNumber.slice(record.phoneNumber.length > 8 ? -4 : -2)}` : '' }
}
exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, message: '无法识别微信身份，请在微信中重试' }
  const db = cloud.database()
  const uid = 'user_' + crypto.createHash('sha256').update(OPENID).digest('hex')
  const col = db.collection('userProfiles')
  let record
  try { record = (await col.doc(uid).get()).data }
  catch (e) {
    if (!/not exist|not found|DATABASE_COLLECTION_NOT_EXIST|DOCUMENT_NOT_EXIST|-502005/i.test(e.errMsg || e.message || '')) return { success: false, message: '账号读取失败，请稍后重试' }
  }
  if (event.action === 'get') return { success: true, user: record && record.consentVersion ? publicProfile(record) : null }
  if (event.action === 'login') {
    if (event.consent !== true) return { success: false, message: '请先阅读并同意隐私说明' }
    if (!record) {
      try { await db.createCollection('userProfiles') }
      catch (e) { if (!/already exist|collection exist|DATABASE_COLLECTION_EXIST|ResourceExist|集合已存在/i.test(e.errMsg || e.message || '')) throw e }
      record = { _id: uid, nickname: '', avatarUrl: '', consentVersion: CONSENT_VERSION }
      const { _id, ...data } = record
      await col.doc(uid).set({ data: { ...data, createdAt: db.serverDate() } })
    } else if (!record.consentVersion) {
      record.consentVersion = CONSENT_VERSION
      await col.doc(uid).update({ data: { consentVersion: CONSENT_VERSION } })
    }
    return { success: true, user: publicProfile(record) }
  }
  if (!record || !record.consentVersion) return { success: false, message: '请先登录后再操作' }
  let patch = {}
  if (event.action === 'save') {
    if (event.nickname !== undefined) {
      if (typeof event.nickname !== 'string' || !event.nickname.trim() || event.nickname.trim().length > 24) return { success: false, message: '昵称需为 1～24 个字符' }
      const nickname = event.nickname.trim()
      try {
        const review = await cloud.openapi.security.msgSecCheck({ openid: OPENID, scene: 1, version: 2, content: nickname })
        if (!review.result || review.result.suggest !== 'pass') return { success: false, message: '昵称暂未通过审核，请更换后重试' }
      } catch (_) { return { success: false, message: '昵称审核暂不可用，请稍后重试' } }
      patch.nickname = nickname
    }
    if (event.avatarUrl !== undefined) {
      const value = event.avatarUrl
      // 只能引用当前微信身份目录下的云图片，不接受外部地址或其他用户的头像路径。
      if (typeof value !== 'string' || !value.startsWith('cloud://') || !value.includes(`/avatars/${uid}/`) || !/\.jpg$/.test(value)) return { success: false, message: '头像地址无效，请重新选择' }
      patch.avatarUrl = value
    }
  } else if (event.action === 'bindPhone') {
    if (typeof event.code !== 'string' || !event.code || event.code.length > 512) return { success: false, message: '手机号授权已失效，请重新授权' }
    try {
      const result = await cloud.openapi.phonenumber.getPhoneNumber({ code: event.code })
      const info = result.phoneInfo || result.phone_info
      const number = info && (info.purePhoneNumber || info.pure_phone_number)
      if (!number || !/^\d{7,15}$/.test(number)) throw new Error('invalid number')
      patch.phoneNumber = number
      patch.phoneCountryCode = String(info.countryCode || info.country_code || '')
    } catch (_) { return { success: false, message: '绑定未完成，请确认小程序已开通手机号能力后重试' } }
  } else return { success: false, message: '不支持的账号操作' }
  await col.doc(uid).update({ data: { ...patch, updatedAt: db.serverDate() } })
  return { success: true, user: publicProfile({ ...record, ...patch }) }
}
