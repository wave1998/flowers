// app.js
const auth = require('./utils/auth')

// ⚠️ 填入你的云开发环境 ID（云开发控制台首页可查，形如 huayuting-1a2b3c）
// 使用控制台的「环境 ID」，不是腾讯云主账号 ID、环境名称或小程序 AppID。
// 只有已配置默认环境时才可以留空。
const ENV_ID = 'cloud1-d4gyrhto84007a0e2'

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    wx.cloud.init({
      env: ENV_ID || undefined,
      traceUser: true
    })
    auth.restore()
  }
})
