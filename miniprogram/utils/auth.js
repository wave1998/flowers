// 微信云调用负责身份校验；这里仅管理用户主动登录后的界面状态。
const KEY = 'hyt_account_v2'
let user = null
let restored = false
let restoring = null
async function call(action, data = {}) {
  if (!wx.cloud) throw new Error('当前无法使用微信云服务')
  let result
  try { result = (await wx.cloud.callFunction({ name: 'userAccount', data: { action, ...data } })).result }
  catch (error) {
    if (/FUNCTION_NOT_FOUND|function.*not.*exist|-501000/i.test(error.errMsg || error.message || '')) throw new Error('账号服务尚未部署，请稍后重试')
    throw new Error('暂时无法连接账号服务，请检查网络后重试')
  }
  if (!result || !result.success) throw new Error((result && result.message) || '账号操作失败')
  return result
}
function remember(profile) {
  user = profile
  try { if (profile) wx.setStorageSync(KEY, { consent: true }); else wx.removeStorageSync(KEY) } catch (_) {}
  return profile
}
function restore() {
  if (restoring) return restoring
  if (restored) return Promise.resolve(user)
  restored = true
  let saved
  try { saved = wx.getStorageSync(KEY) } catch (_) {}
  if (!saved || !saved.consent) return Promise.resolve(null)
  restoring = call('get').then(r => remember(r.user || null)).catch(() => null).finally(() => { restoring = null })
  return restoring
}
async function login() { return remember((await call('login', { consent: true })).user) }
async function save(patch) { return remember((await call('save', patch)).user) }
async function bindPhone(code) { return remember((await call('bindPhone', { code })).user) }
function getUser() { return user }
function isLoggedIn() { return !!user }
function openAccount(focus = '') { wx.navigateTo({ url: `/pages/account/account?focus=${encodeURIComponent(focus)}` }) }
function logout() { remember(null); restored = true }
module.exports = { restore, login, save, bindPhone, getUser, isLoggedIn, openAccount, logout }
