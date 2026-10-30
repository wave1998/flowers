// app.js

// ⚠️ 填入你的云开发环境 ID（云开发控制台首页可查，形如 huayuting-1a2b3c）
// 留空 '' 则使用默认环境（账号下第一个创建的环境）
const ENV_ID = ''

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
  }
})
