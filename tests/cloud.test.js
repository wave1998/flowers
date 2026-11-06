const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { describeCloudError } = require('../miniprogram/utils/cloud-error')

const root = path.resolve(__dirname, '..')

function loadModule(relativePath, dependencies = {}, globals = {}) {
  const filename = path.join(root, relativePath)
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    exports: module.exports,
    __dirname: path.dirname(filename),
    require: name => Object.prototype.hasOwnProperty.call(dependencies, name)
      ? dependencies[name]
      : require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name),
    console: { error() {} },
    Buffer,
    ...globals
  }, { filename })
  return module.exports
}

function loadPage(api) {
  let definition
  loadModule('miniprogram/pages/index/index.js', { '../../utils/cloud': api }, {
    Page: value => { definition = value },
    wx: { showToast() {} }
  })
  return {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch) }
  }
}

test('missing default environment is diagnosed separately from missing data', () => {
  const error = describeCloudError({ errCode: -501000, errMsg: 'Environment not found, there is no default environment exists' })
  assert.match(error.title, /环境未配置/)
  assert.match(error.message, /ENV_ID/)
  assert.equal(error.needsInitialization, undefined)
})

test('wrapped cloud function timeout has specific recovery instructions', () => {
  const error = describeCloudError({ errCode: -1, errMsg: 'cloud.callFunction:fail Error: errCode: -504003 | errMsg: Invoking task timed out after 3 seconds' })
  assert.match(error.title, /执行超时/)
  assert.match(error.message, /预打包图片/)
})

test('homepage distinguishes environment errors, missing collections and empty collections', async () => {
  for (const [error, isEmpty, title] of [
    [{ errCode: -501000, errMsg: 'Environment not found' }, false, /环境未配置/],
    [{ errMsg: 'database collection not exists' }, true, null],
    [new Error('network disconnected'), false, /暂时无法连接/]
  ]) {
    const page = loadPage({ getDailyFlower: async () => { throw error } })
    await page.loadData()
    assert.equal(page.data.isEmpty, isEmpty)
    assert.equal(page.data.loading, false)
    assert.equal(page.data.daily, null)
    if (title) assert.match(page.data.loadError.title, title)
    else assert.equal(page.data.loadError, null)
  }
  const empty = loadPage({ getDailyFlower: async () => null })
  await empty.loadData()
  assert.equal(empty.data.isEmpty, true)
  assert.equal(empty.data.loadError, null)
})

test('retry recovers homepage after environment is corrected', async () => {
  let ready = false
  const daily = { _id: 'rose', name: '玫瑰' }
  const page = loadPage({
    getDailyFlower: async () => {
      if (!ready) throw new Error('Environment not found')
      return daily
    },
    getFlowers: async () => [daily]
  })
  await page.loadData()
  ready = true
  await page.onRetry()
  assert.equal(page.data.daily, daily)
  assert.equal(page.data.loadError, null)
  assert.equal(page.data.isEmpty, false)
})

test('partial import failures remain visible after homepage reload', async () => {
  const daily = { _id: 'rose', name: '玫瑰' }
  const page = loadPage({
    initDatabase: async () => ({ success: true, imported: 1, failures: ['百合: 图片下载失败'] }),
    getDailyFlower: async () => daily,
    getFlowers: async () => [daily]
  })
  await page.onInit()
  assert.equal(page.data.initializing, false)
  assert.equal(page.data.daily, daily)
  assert.match(page.data.initError, /百合/)
})

test('offline search matches names and meanings literally without a cloud request', async () => {
  const api = loadModule('miniprogram/utils/cloud.js', {}, { wx: {} })
  const rows = await api.searchFlowers('思念')
  assert.ok(rows.length > 10)
  assert.equal((await api.searchFlowers('.*+[a]')).length, 0)
  assert.ok((await api.searchFlowers('红玫瑰')).some(f => f.name === '玫瑰'))
})

test('client advances cursor after failed items and reports failures', async () => {
  const cursors = []
  const responses = [
    { success: true, imported: 0, remaining: 1, nextCursor: 1, failures: ['玫瑰: 没有图片'] },
    { success: true, imported: 1, remaining: 0, nextCursor: 2, failures: [] }
  ]
  const api = loadModule('miniprogram/utils/cloud.js', {}, {
    wx: { cloud: { callFunction: async request => {
      if (request.data.action === 'prepare') return { result: { success: true, prepared: true } }
      cursors.push(request.data.cursor)
      return { result: responses.shift() }
    } } }
  })
  const progress = []
  const result = await api.initDatabase((imported, remaining) => progress.push([imported, remaining]))
  assert.deepEqual(cursors, [0, 1])
  assert.deepEqual(progress, [[0, 1], [1, 0]])
  assert.equal(result.success, true)
  assert.equal(result.imported, 1)
  assert.equal(result.failures.length, 1)
})

test('client rejects invalid responses and stalled progress instead of reporting success', async () => {
  for (const result of [
    {},
    { success: true },
    { success: true, imported: 0, remaining: 5 },
    { success: true, imported: 0, remaining: 5, nextCursor: 0 }
  ]) {
    let calls = 0
    const api = loadModule('miniprogram/utils/cloud.js', {}, {
      wx: { cloud: { callFunction: async request => {
        if (request.data.action === 'prepare') return { result: { success: true, prepared: true } }
        calls++; return { result }
      } } }
    })
    const response = await api.initDatabase()
    assert.equal(response.success, false)
    assert.ok(calls <= 2)
  }
})

test('client reports failure if the batch limit is reached with work remaining', async () => {
  let calls = 0
  const api = loadModule('miniprogram/utils/cloud.js', {}, {
    wx: { cloud: { callFunction: async request => {
      if (request.data.action === 'prepare') return { result: { success: true, prepared: true } }
      return { result: { success: true, imported: 0, remaining: 1, nextCursor: ++calls } }
    } } }
  })
  const result = await api.initDatabase()
  assert.equal(result.success, false)
  assert.equal(calls, 1000)
  assert.match(result.message, /上限/)
})

function loadImporter(options = {}) {
  const seed = options.seed || require('../cloudfunctions/initDatabase/seed.json').slice(0, 2)
  const records = options.records || []
  const uploaded = []
  let filter
  const collection = {
    where(value) { filter = value; return this },
    limit() { return this },
    async get() {
      if (options.readError) throw options.readError
      return { data: records.filter(record => record.name === filter.name) }
    },
    doc(id) {
      return { async set({ data }) {
        const existing = records.findIndex(record => record._id === id)
        if (existing >= 0) records[existing] = { _id: id, ...data }
        else records.push({ _id: id, ...data })
      }, async update({ data }) {
        const existing = records.find(record => record._id === id)
        if (!existing) throw new Error('文档不存在')
        Object.assign(existing, data)
      } }
    }
  }
  const database = {
    async createCollection() {
      if (options.createError) throw options.createError
      throw new Error('collection already exists')
    },
    collection: () => collection,
    serverDate: () => 'server-time'
  }
  const cloud = {
    init() {},
    database: () => database,
    uploadFile: async request => { uploaded.push(request.cloudPath); return { fileID: 'cloud://flower.jpg' } }
  }
  const manifest = Object.fromEntries(seed.map((flower, index) => [flower.name, {
    file: `flower_${index}.jpg`, thumbnailFile: `thumb_flower_${index}.jpg`, assetVersion: 2,
    width: 800, height: 800, source: 'iNaturalist',
    title: flower.name, license: 'CC0', author: 'Author', sourceUrl: 'https://example.test/photo', modification: 'medium'
  }]))
  const importer = loadModule('cloudfunctions/initDatabase/index.js', {
    'wx-server-sdk': cloud, './seed.json': seed, './images/manifest.json': manifest,
    ...(options.manifest ? { './images/manifest.json': options.manifest } : {}),
    fs: { readFileSync(filename) {
      if (options.failFirst && filename.endsWith('flower_0.jpg')) throw new Error('缺少图片')
      return Buffer.from('image')
    } }
  })
  return { importer, seed, records, uploaded }
}

test('server advances past a failed image, imports the next flower, and skips existing data on retry', async () => {
  const { importer, seed, records, uploaded } = loadImporter({ failFirst: true })
  const first = await importer.main({ cursor: 0 })
  assert.equal(first.imported, 0)
  assert.equal(first.remaining, 1)
  assert.equal(first.nextCursor, 1)
  assert.equal(first.failures.length, 1)
  const second = await importer.main({ cursor: first.nextCursor })
  assert.equal(second.imported, 0)
  assert.equal(second.needsThumbnail, true)
  const thumbnail = await importer.main({ cursor: 1, variant: 'thumbnail' })
  assert.equal(thumbnail.imported, 1)
  assert.equal(thumbnail.remaining, 0)
  assert.equal(records[0].name, seed[1].name)
  assert.equal(uploaded.length, 2)
  const retry = await importer.main({ cursor: 1 })
  assert.equal(retry.imported, 0)
  assert.equal(records.length, 1)
  assert.equal(uploaded.length, 2)
})

test('server does not count existing flowers as newly imported', async () => {
  const records = require('../cloudfunctions/initDatabase/seed.json').slice(0, 2).map(({ name }, i) => ({
    _id: String(i), name, image: 'cloud://hd.jpg', thumbnail: 'cloud://thumb.jpg', imageVersion: 2, thumbnailVersion: 2
  }))
  const { importer } = loadImporter({ records })
  const result = await importer.main()
  assert.equal(result.imported, 0)
  assert.equal(result.remaining, 1)
  const last = await importer.main({ cursor: 1 })
  assert.equal(last.imported, 0)
  assert.equal(last.remaining, 0)
})

test('server stops before writing when collection creation or existing-data reads fail', async () => {
  for (const options of [
    { createError: new Error('permission denied') },
    { readError: new Error('network disconnected') }
  ]) {
    const { importer, records, uploaded } = loadImporter(options)
    await assert.rejects(() => importer.main(options.createError ? { action: 'prepare' } : {}))
    assert.equal(records.length, 0)
    assert.equal(uploaded.length, 0)
  }
})

test('collection preparation is separate from picture uploads', async () => {
  const { importer, uploaded, records } = loadImporter()
  const result = await importer.main({ action: 'prepare' })
  assert.equal(result.prepared, true)
  assert.equal(uploaded.length, 0)
  assert.equal(records.length, 0)
})

test('every seed flower includes a packaged JPEG with attribution and a free license', () => {
  const seed = require('../cloudfunctions/initDatabase/seed.json')
  const manifest = require('../cloudfunctions/initDatabase/images/manifest.json')
  for (const flower of seed.filter(f => f.imageQuery)) {
    const image = manifest[flower.name]
    assert.ok(image, flower.name)
    assert.ok(['CC0', 'CC-BY', 'CC-BY-SA'].includes(image.license), flower.name)
    assert.ok(image.author && image.sourceUrl && image.width > 0 && image.height > 0)
    const bytes = fs.readFileSync(path.join(root, 'cloudfunctions/initDatabase/images', image.file))
    assert.equal(bytes[0], 0xff, flower.name)
    assert.equal(bytes[1], 0xd8, flower.name)
    const thumbnail = fs.readFileSync(path.join(root, 'cloudfunctions/initDatabase/images', image.thumbnailFile))
    assert.equal(thumbnail[0], 0xff, flower.name)
    assert.equal(thumbnail[1], 0xd8, flower.name)
    assert.ok(Math.max(image.thumbnailWidth, image.thumbnailHeight) <= 400)
    assert.ok(Math.max(image.hdWidth, image.hdHeight) > Math.max(image.thumbnailWidth, image.thumbnailHeight))
  }
})

test('image upgrade preserves legacy record IDs and creation time and resumes without uploading HD twice', async () => {
  const records = [{ _id: 'legacy-id', name: '玫瑰', image: 'cloud://old.jpg', createdAt: 'original-time' }]
  const { importer, uploaded } = loadImporter({ records })
  const hd = await importer.main({ cursor: 0 })
  assert.equal(hd.needsThumbnail, true)
  assert.equal(records[0]._id, 'legacy-id')
  assert.equal(records[0].createdAt, 'original-time')
  const resumed = await importer.main({ cursor: 0 })
  assert.equal(resumed.needsThumbnail, true)
  assert.equal(uploaded.length, 1)
  await importer.main({ cursor: 0, variant: 'thumbnail' })
  assert.equal(uploaded.length, 2)
  assert.match(uploaded[0], /flowers\/hd\/legacy-id/)
  assert.match(uploaded[1], /flowers\/thumbs\/legacy-id/)
  const complete = await importer.main({ cursor: 0 })
  assert.equal(complete.needsThumbnail, false)
  assert.equal(uploaded.length, 2)
  assert.equal(records.length, 1)
})

test('client uploads HD and thumbnail before advancing to the next flower', async () => {
  const requests = []
  const api = loadModule('miniprogram/utils/cloud.js', {}, {
    wx: { cloud: { callFunction: async ({ data }) => {
      if (data.action === 'prepare') return { result: { success: true, prepared: true } }
      requests.push(`${data.cursor}:${data.variant || 'image'}`)
      if (data.cursor === 0 && !data.variant) return { result: { success: true, needsThumbnail: true, imported: 0, remaining: 2, nextCursor: 0 } }
      return { result: { success: true, imported: data.variant ? 1 : 0, remaining: data.variant ? 1 : 0, nextCursor: data.cursor + 1 } }
    } } }
  })
  const result = await api.initDatabase()
  assert.equal(result.success, true)
  assert.equal(result.imported, 1)
  assert.deepEqual(requests, ['0:image', '0:thumbnail', '1:image'])
})

test('list only updates back-to-top visibility across the scroll threshold', () => {
  let definition
  let scrollOptions
  let destination
  loadModule('miniprogram/pages/list/list.js', { '../../utils/cloud': {} }, {
    Page: value => { definition = value },
    wx: { pageScrollTo: value => { scrollOptions = value }, navigateTo: value => { destination = value } }
  })
  let updates = 0
  const page = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); updates++ } }
  page.onPageScroll({ scrollTop: 0 })
  page.onPageScroll({ scrollTop: 321 })
  page.onPageScroll({ scrollTop: 800 })
  assert.equal(page.data.showBackTop, true)
  assert.equal(updates, 1)
  page.backToTop()
  assert.equal(scrollOptions.scrollTop, 0)
  assert.equal(scrollOptions.duration, 300)
  page.onPageScroll({ scrollTop: 0 })
  assert.equal(page.data.showBackTop, false)
  assert.equal(updates, 2)
  page.goSearch()
  assert.equal(destination.url, '/pages/search/search')
})

test('catalog contains at least 200 distinct entries and complete classifications', () => {
  const catalog = require('../miniprogram/utils/catalog')
  assert.ok(catalog.count >= 200)
  assert.equal(new Set(catalog.flowers.map(f => f.name)).size, catalog.count)
  assert.equal(new Set(catalog.flowers.map(f => f._id)).size, catalog.count)
  for (const f of catalog.flowers) {
    assert.ok(f.name && f.meaning && f.description && f.meaningKind && f.meaningNote, f.name)
    for (const field of ['family', 'bloomSeason', 'origin', 'care']) assert.ok(typeof f[field] === 'string' && f[field].trim(), `${f.name}: ${field}`)
    assert.ok(Array.isArray(f.colors) && f.colors.length > 0 && f.colors.every(Boolean), `${f.name}: colors`)
    assert.ok(!f.description.startsWith('花语亭为「'), `${f.name}: 缺少植物介绍`)
    assert.ok(f.thumbnail.startsWith('cloud://') || fs.existsSync(path.join(root, 'miniprogram', f.thumbnail)), f.name)
    if (f.fallbackThumbnail) assert.ok(fs.existsSync(path.join(root, 'miniprogram', f.fallbackThumbnail)), f.name)
    if (f.meaningKind === 'historical') assert.ok(f.meaningSource.url && f.meaningSource.original)
    if (f.imagePlaceholder) assert.match(f.image, /placeholder/)
  }
})

test('every registered illustration has an original and an app thumbnail', () => {
  const art = require('../data/illustrations.json')
  const catalog = require('../miniprogram/utils/catalog')
  for (const [name, entry] of Object.entries(art)) {
    const flower = catalog.flowers.find(f => f.name === name)
    assert.ok(flower, name)
    assert.equal(flower.imageKind, 'ai-illustration', name)
    assert.ok(flower.fallbackThumbnail || flower.thumbnail, name)
    if (flower.thumbnail.startsWith('cloud://')) assert.ok(flower.thumbnail.endsWith(`/thumbnail/${flower._id}.jpg`), name)
    assert.ok(fs.existsSync(path.join(root, entry.original)), name)
  }
})

test('colour variants resolve to their parent and remain searchable by their old names', () => {
  const catalog = require('../miniprogram/utils/catalog')
  const crypto = require('node:crypto')
  for (const [variant, parent] of [['红玫瑰', '玫瑰'], ['蓝绣球', '绣球花'], ['桔梗花（白）', '桔梗']]) {
    const oldId = 'flower_' + crypto.createHash('sha1').update(variant).digest('hex')
    assert.equal(catalog.get(oldId).name, parent)
    assert.ok(catalog.search(variant).some(f => f.name === parent))
    assert.ok(!catalog.flowers.some(f => f.name === variant))
  }
})

test('a legacy colour favorite is recognized and removed from its parent', async () => {
  const catalog = require('../miniprogram/utils/catalog')
  const rose = catalog.flowers.find(f => f.name === '玫瑰')
  const records = [{ _id: 'old', flowerId: rose.legacyIds[0] }]
  const col = {
    where: ({ flowerId }) => ({
      count: async () => ({ total: records.filter(r => r.flowerId === flowerId).length }),
      get: async () => ({ data: records.filter(r => r.flowerId === flowerId) })
    }),
    doc: id => ({ remove: async () => { records.splice(records.findIndex(r => r._id === id), 1) } })
  }
  const api = loadModule('miniprogram/utils/cloud.js', { './auth': { isLoggedIn: () => true } }, {
    wx: { cloud: { database: () => ({ collection: () => col }) } }
  })
  assert.equal(await api.isFavorite(rose._id), true)
  assert.equal(await api.toggleFavorite(rose), false)
  assert.equal(records.length, 0)
})

test('catalog list, detail and search work offline; detail opens with the same stable ID', async () => {
  const api = loadModule('miniprogram/utils/cloud.js', {}, { wx: {} })
  const total = await api.getFlowerCount()
  let seen = []
  for (let page = 0; page < Math.ceil(total / 20); page++) seen.push(...await api.getFlowers(page))
  assert.equal(seen.length, total)
  assert.equal(new Set(seen.map(f => f._id)).size, total)
  const flower = seen[0]
  assert.equal(api.getCachedFlowerById(flower._id).name, flower.name)
  assert.equal((await api.getFlowerById(flower._id)).name, flower.name)
  assert.equal((await api.getFlowers(Math.ceil(total / 20))).length, 0)
})

function detailPage(api, auth) {
  let definition
  const destinations = []
  loadModule('miniprogram/pages/detail/detail.js', { '../../utils/cloud': api, '../../utils/auth': auth }, {
    Page: value => { definition = value }, setTimeout, clearTimeout,
    wx: { setNavigationBarTitle() {}, showToast() {}, navigateTo: value => destinations.push(value) }
  })
  return { ...definition, data: { ...definition.data }, setData(value) { Object.assign(this.data, value) }, destinations }
}

test('detail displays cached text before cloud refresh settles', async () => {
  const flower = { _id: 'id', name: '玫瑰', thumbnail: '/local.jpg', image: 'cloud://hd' }
  const page = detailPage({ getCachedFlowerById: () => flower, getFlowerById: async () => flower, refreshFlowerById: () => new Promise(() => {}) }, {})
  page.onLoad({ id: 'id' })
  assert.equal(page.data.flower.name, '玫瑰')
  assert.equal(page.data.loading, false)
  await Promise.resolve(); page.onUnload()
})

test('detail uses the in-page preview and falls back when the original is unavailable', async () => {
  let page, toast
  loadModule('miniprogram/pages/detail/detail.js', { '../../utils/cloud': {}, '../../utils/auth': {} }, {
    Page: value => { page = value },
    wx: { cloud: { downloadFile: async () => { throw new Error('missing original') } }, getImageInfo: ({ src, success }) => success({ path: src }), showToast: options => { toast = options } }
  })
  page.setData = patch => Object.assign(page.data, patch)
  page.data = { flower: { imageKind: 'ai-illustration', image: '/thumb.jpg', originalImage: 'cloud://env/original.png' } }
  await page.previewImage()
  assert.equal(page.data.previewSrc, '/thumb.jpg')
  page.closePreview()
  assert.equal(page.data.previewSrc, '')
  page.data.flower.originalImage = undefined
  await page.previewImage()
  assert.equal(page.data.previewSrc, '/thumb.jpg')
  assert.equal(toast, undefined)
})

function mockCanvas(context, loadImage = image => Promise.resolve().then(() => image.onload())) {
  const canvas = { getContext: () => context, requestAnimationFrame: done => done(), createImage() {
    return { set src(value) { this.path = value; loadImage(this) } }
  } }
  return { canvas, createSelectorQuery() {
    const query = { in: () => query, select: () => query, fields: () => query, exec: done => done([{ node: canvas }]) }
    return query
  } }
}

test('preview and save share the same in-flight cloud download and cached image', async () => {
  let page, downloadCount = 0, completeDownload, saved
  const context = { drawImage() {}, fillText() {} }
  const canvas = mockCanvas(context)
  const wx = { cloud: { downloadFile: () => { downloadCount++; return new Promise(resolve => { completeDownload = resolve }) } },
    getImageInfo: ({ success }) => success({ path: '/tmp/source.png', width: 1200, height: 1200 }),
    getWindowInfo: () => ({ windowWidth: 375 }), createSelectorQuery: canvas.createSelectorQuery,
    canvasToTempFilePath: ({ success }) => success({ tempFilePath: '/tmp/watermarked.png' }),
    saveImageToPhotosAlbum: ({ filePath, success }) => { saved = filePath; success() }, showToast() {} }
  loadModule('miniprogram/pages/detail/detail.js', { '../../utils/cloud': {}, '../../utils/auth': {} }, { Page: value => { page = value }, wx })
  page.data = { flower: { originalImage: 'cloud://env/original.png' }, savingImage: false }
  page.setData = (patch, done) => { Object.assign(page.data, patch); if (done) done() }
  const preparing = page.previewImage()
  await Promise.resolve()
  const sameRequest = page.getPreviewImageInfo('cloud://env/original.png')
  assert.equal(downloadCount, 1)
  completeDownload({ tempFilePath: '/tmp/source.png' })
  await Promise.all([preparing, sameRequest])
  assert.equal(page.data.previewSrc, '/tmp/source.png')
  await page.saveWatermarkedImage()
  assert.equal(downloadCount, 1)
  assert.equal(saved, '/tmp/watermarked.png')
})

test('saving an illustration draws the watermark before saving the exported image', async () => {
  let page, saved, drawnText, imageToLoad, drawnImage, exported = false
  const context = { drawImage: image => { drawnImage = image }, fillText: text => { drawnText = text } }
  const canvas = mockCanvas(context, image => { imageToLoad = image })
  const wx = { cloud: { downloadFile: async () => ({ tempFilePath: '/tmp/source.png' }) },
    getImageInfo: ({ success }) => success({ path: '/tmp/source.png', width: 1254, height: 1254 }),
    getWindowInfo: () => ({ windowWidth: 375 }), createSelectorQuery: canvas.createSelectorQuery,
    canvasToTempFilePath: ({ canvas: exportedCanvas, success }) => { assert.equal(exportedCanvas, canvas.canvas); exported = true; success({ tempFilePath: '/tmp/watermarked.png' }) },
    saveImageToPhotosAlbum: ({ filePath, success }) => { saved = filePath; success() }, showToast() {} }
  loadModule('miniprogram/pages/detail/detail.js', { '../../utils/cloud': {}, '../../utils/auth': {} }, { Page: value => { page = value }, wx })
  page.data = { previewSrc: 'cloud://env/original.png', savingImage: false }
  page.setData = (patch, done) => { Object.assign(page.data, patch); if (done) done() }
  const saving = page.saveWatermarkedImage()
  while (!imageToLoad) await Promise.resolve()
  assert.equal(exported, false)
  assert.equal(saved, undefined)
  imageToLoad.onload()
  await saving
  assert.equal(drawnImage, imageToLoad)
  assert.equal(drawnText, '花语亭')
  assert.equal(saved, '/tmp/watermarked.png')
  assert.equal(page.data.savingImage, false)
})

test('a stale cloud placeholder cannot hide a local illustration', async () => {
  const catalog = require('../miniprogram/utils/catalog')
  const flower = catalog.flowers.find(f => f.imageKind === 'ai-illustration')
  const api = loadModule('miniprogram/utils/cloud.js', {}, {
    wx: { cloud: { database: () => ({ collection: () => ({ doc: () => ({
      get: async () => ({ data: { imagePlaceholder: true, image: '/old-placeholder.png' } })
    }) }) }) } }
  })
  const refreshed = await api.refreshFlowerById(flower._id)
  assert.equal(refreshed.imagePlaceholder, false)
  assert.equal(refreshed.image, flower.image)
})

test('favorite opens login for guests and resumes once after successful login', async () => {
  let loggedIn = false, writes = 0, navigations = 0
  const auth = { restore: async () => {}, isLoggedIn: () => loggedIn, openAccount: () => { navigations++ } }
  const page = detailPage({ isFavorite: async () => false, toggleFavorite: async () => { writes++; return true } }, auth)
  page._id = 'id'; page.data.flower = { _id: 'id' }
  await page.onToggleFav()
  assert.equal(writes, 0); assert.equal(navigations, 1)
  loggedIn = true
  await page.onShow()
  assert.equal(writes, 1); assert.equal(page.data.faved, true)
  await page.onShow()
  assert.equal(writes, 1)
})

test('cancelled login does not favorite; existing favorite is not toggled off on resume', async () => {
  let loggedIn = false, writes = 0
  const auth = { restore: async () => {}, isLoggedIn: () => loggedIn, openAccount() {} }
  const page = detailPage({ isFavorite: async () => true, toggleFavorite: async () => { writes++ } }, auth)
  page._id = 'id'; page.data.flower = { _id: 'id' }
  await page.onToggleFav(); await page.onShow()
  assert.equal(writes, 0)
  await page.onToggleFav(); loggedIn = true; await page.onShow()
  assert.equal(writes, 0); assert.equal(page.data.faved, true)
})

function accountService(phoneNumber = '13812345678') {
  const records = new Map(); let openid = 'alice'; const codes = []; let moderation = 'pass'
  const database = {
    createCollection: async () => {}, serverDate: () => 1,
    collection: () => ({ doc: id => ({
      get: async () => { if (!records.has(id)) throw new Error('document not found'); return { data: records.get(id) } },
      set: async ({ data }) => records.set(id, { _id: id, ...data }),
      update: async ({ data }) => Object.assign(records.get(id), data)
    }) })
  }
  const cloud = {
    init() {}, getWXContext: () => ({ OPENID: openid }), database: () => database,
    openapi: { phonenumber: { getPhoneNumber: async ({ code }) => { codes.push(code); if (code !== 'valid') throw new Error('invalid'); return { phoneInfo: { purePhoneNumber: phoneNumber, countryCode: '86' } } } },
      security: { msgSecCheck: async () => ({ result: { suggest: moderation } }) } }
  }
  return { service: loadModule('cloudfunctions/userAccount/index.js', { 'wx-server-sdk': cloud }), records, codes, setIdentity(value) { openid = value }, rejectNickname() { moderation = 'risky' } }
}

test('server requires explicit consent and isolates accounts by SDK identity', async () => {
  const { service, setIdentity } = accountService()
  assert.equal((await service.main({ action: 'save', nickname: 'Alice' })).success, false)
  assert.equal((await service.main({ action: 'login', consent: false })).success, false)
  const alice = (await service.main({ action: 'login', consent: true })).user
  await service.main({ action: 'save', nickname: 'Alice' })
  setIdentity('bob')
  assert.equal((await service.main({ action: 'get', uid: alice.uid })).user, null)
  const bob = (await service.main({ action: 'login', consent: true, uid: alice.uid })).user
  assert.notEqual(alice.uid, bob.uid)
})

test('phone binding only accepts a WeChat code and never returns the full number', async () => {
  const { service, codes } = accountService()
  await service.main({ action: 'login', consent: true })
  assert.equal((await service.main({ action: 'bindPhone', phoneNumber: '13812345678' })).success, false)
  assert.equal((await service.main({ action: 'bindPhone', code: 'invalid' })).success, false)
  const result = await service.main({ action: 'bindPhone', code: 'valid' })
  assert.equal(result.user.phoneBound, true)
  assert.equal(result.user.phoneMasked, '138****5678')
  assert.ok(!JSON.stringify(result).includes('13812345678'))
  assert.deepEqual(codes, ['invalid', 'valid'])
})

test('profile rejects foreign avatars and unreviewed nicknames', async () => {
  const { service, rejectNickname } = accountService()
  await service.main({ action: 'login', consent: true })
  assert.equal((await service.main({ action: 'save', avatarUrl: 'cloud://env/avatars/somebody/1.jpg' })).success, false)
  assert.equal((await service.main({ action: 'save', nickname: 'a'.repeat(25) })).success, false)
  rejectNickname()
  assert.equal((await service.main({ action: 'save', nickname: 'unreviewed' })).success, false)
})


test('text-only entries import without uploading unrelated photographs', async () => {
  const { importer, records, uploaded } = loadImporter({ seed: [{ name: '新花', meaning: '希望', meaningKind: 'editorial' }], manifest: {} })
  assert.equal((await importer.main({ action: 'prepare' })).prepared, true)
  const result = await importer.main({ cursor: 0 })
  assert.equal(result.imported, 1)
  assert.equal(result.remaining, 0)
  assert.equal(uploaded.length, 0)
  assert.equal(records[0].imagePlaceholder, true)
  assert.equal((await importer.main({ cursor: 0 })).imported, 0)
  assert.equal(records.length, 1)
})


test('short international numbers are masked as well', async () => {
  const { service } = accountService('1234567')
  await service.main({ action: 'login', consent: true })
  const result = await service.main({ action: 'bindPhone', code: 'valid' })
  assert.equal(result.user.phoneMasked, '123****67')
  assert.ok(!JSON.stringify(result).includes('1234567'))
})
