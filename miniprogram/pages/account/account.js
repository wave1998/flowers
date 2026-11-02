const auth = require('../../utils/auth')
Page({
  data: { user: null, nickname: '', avatarUrl: '', consent: false, busy: false, error: '', focusNickname: false },
  async onLoad(options) {
    this._focus = options.focus || ''
    await auth.restore()
    this.syncUser()
  },
  syncUser() {
    const user = auth.getUser()
    this.setData({ user, nickname: user ? user.nickname : '', avatarUrl: user ? user.avatarUrl : '', focusNickname: !!user && this._focus === 'nickname' })
  },
  onConsent(e) { this.setData({ consent: e.detail.value.includes('agree') }) },
  openPrivacy() { wx.navigateTo({ url: '/pages/privacy/privacy' }) },
  async onLogin() {
    if (this.data.busy) return
    if (!this.data.consent) { this.setData({ error: '请先阅读并同意隐私说明' }); return }
    this.setData({ busy: true, error: '' })
    try {
      await auth.login()
      this.syncUser()
      if (this._focus === 'favorite') wx.navigateBack()
    } catch (e) { this.setData({ error: e.message }) }
    finally { this.setData({ busy: false }) }
  },
  onChooseAvatar(e) {
    if (!e.detail.avatarUrl) return
    this._avatarTemp = e.detail.avatarUrl
    this.setData({ avatarUrl: this._avatarTemp, error: '' })
  },
  onNickname(e) { this.setData({ nickname: e.detail.value }) },
  async onSave() {
    if (!this.data.user || this.data.busy) return
    const nickname = this.data.nickname.trim()
    if (nickname.length > 24) { this.setData({ error: '昵称最多 24 个字符' }); return }
    this.setData({ busy: true, error: '' })
    try {
      const patch = {}
      if (nickname !== this.data.user.nickname) {
        if (!nickname) throw new Error('请输入昵称')
        patch.nickname = nickname
      }
      if (this._avatarTemp) {
        const result = await wx.cloud.uploadFile({ cloudPath: `avatars/${this.data.user.uid}/${Date.now()}.jpg`, filePath: this._avatarTemp })
        patch.avatarUrl = result.fileID
      }
      if (Object.keys(patch).length) await auth.save(patch)
      this._avatarTemp = null
      this.syncUser()
      wx.showToast({ title: '资料已保存', icon: 'success' })
    } catch (e) { this.setData({ error: e.message || '保存失败，请稍后重试' }) }
    finally { this.setData({ busy: false }) }
  },
  async onPhone(e) {
    if (this.data.busy) return
    if (!e.detail.code) { this.setData({ error: '未获取手机号授权，你可以稍后再绑定' }); return }
    this.setData({ busy: true, error: '' })
    try { await auth.bindPhone(e.detail.code); this.setData({ user: auth.getUser() }); wx.showToast({ title: '绑定成功' }) }
    catch (error) { this.setData({ error: error.message }) }
    finally { this.setData({ busy: false }) }
  },
  onLogout() { auth.logout(); this._avatarTemp = null; this.syncUser(); this.setData({ consent: false, error: '' }) }
})
