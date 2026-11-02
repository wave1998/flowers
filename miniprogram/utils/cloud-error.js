/** 把云开发错误转换为可操作的提示，避免把连接失败当成空数据库。 */
function describeCloudError(error) {
  const message = typeof error === 'string'
    ? error
    : (error && (error.errMsg || error.message)) || ''
  const code = error && (error.errCode || error.code)

  if (/Environment not found|INVALID_ENV|no default environment|invalid env/i.test(message)) {
    return {
      title: '云开发环境未配置',
      message: '请先在微信开发者工具中开通云开发，将环境 ID 填入 miniprogram/app.js 的 ENV_ID 后重新编译。环境 ID 不是以 wx 开头的小程序 AppID。',
      detail: code ? `错误码：${code}` : ''
    }
  }
  if (/collection.*(not exist|not found)|DATABASE_COLLECTION_NOT_EXIST/i.test(message)) {
    return { needsInitialization: true }
  }
  if (/permission|unauthorized|access denied|权限/i.test(message)) {
    return {
      title: '数据库访问被拒绝',
      message: '请检查云开发数据库权限：flowers 设为所有用户可读，favorites 设为仅创建者可读写。',
      detail: code ? `错误码：${code}` : ''
    }
  }
  if (/FUNCTION_NOT_FOUND|function.*(not found|not exist)/i.test(message)) {
    return {
      title: '初始化云函数未部署',
      message: '请为 cloudfunctions 选择与 ENV_ID 相同的环境，右键 initDatabase，选择「上传并部署：云端安装依赖」。',
      detail: code ? `错误码：${code}` : ''
    }
  }
  if (/FUNCTIONS_TIME_LIMIT_EXCEEDED|Invoking task timed out/i.test(message)) {
    return {
      title: '初始化云函数执行超时',
      message: '请重试导入，已导入的花卉会自动跳过。若持续超时，请确认已部署最新的预打包图片版本；支持调整超时的环境也可适当增加执行时间。',
      detail: code ? `错误码：${code}` : ''
    }
  }
  if (code === 'CLOUD_UNAVAILABLE') {
    return { title: '当前基础库不支持云开发', message: '请升级微信或在开发者工具中选择支持云开发的基础库。' }
  }
  return {
    title: '暂时无法连接云服务',
    message: '请检查网络和云开发环境状态后重试。',
    detail: [code ? `错误码：${code}` : '', message].filter(Boolean).join(' · ')
  }
}

module.exports = { describeCloudError }
