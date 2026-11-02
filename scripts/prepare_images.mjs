// 在部署前下载公开的自由许可花卉照片；云函数运行时不依赖外部图片站。
// node scripts/prepare_images.mjs（需要访问 iNaturalist 和它的图片 CDN）
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const folder = path.join(root, 'cloudfunctions/initDatabase/images')
const seed = JSON.parse(await readFile(path.join(root, 'cloudfunctions/initDatabase/seed.json'), 'utf8'))
await mkdir(folder, { recursive: true })
const manifestPath = path.join(folder, 'manifest.json')
let manifest = {}
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) } catch {}
const overrides = { '玫瑰': 'Rosa rugosa', '水仙': 'Narcissus tazetta' }
// 精确分类 ID 避免学名搜索匹配到名称相近的其他物种。
const taxonIds = { '牡丹': 125432, '康乃馨': 83063, '茉莉花': 135425, '鸢尾': 57732, '海棠花': 546289 }
const refresh = new Set(process.argv.slice(2))
const licenses = new Set(['cc0', 'cc-by', 'cc-by-sa'])

async function search(taxon, researchOnly, taxonId) {
  const url = new URL('https://api.inaturalist.org/v1/observations')
  const parameters = {
    photo_license: [...licenses].join(','), per_page: '3', order_by: 'votes', order: 'desc'
  }
  if (taxonId) parameters.taxon_id = String(taxonId)
  else parameters.taxon_name = taxon
  if (researchOnly) {
    parameters.quality_grade = 'research'
    parameters.term_id = '12'
    parameters.term_value_id = '13'
  }
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
  const { stdout } = await run('curl', ['-L', '--fail', '--max-time', '30', '-sS', url.href], { maxBuffer: 5 * 1024 * 1024 })
  return JSON.parse(stdout).results || []
}

for (let i = 0; i < seed.length; i++) {
  const flower = seed[i]
  if (refresh.size && !refresh.has(flower.name)) continue
  if (manifest[flower.name] && !refresh.has(flower.name)) {
    try {
      await access(path.join(folder, manifest[flower.name].file))
      console.log(`${flower.name}: 已准备，跳过`)
      continue
    } catch {}
  }
  try {
    const taxon = overrides[flower.name] || flower.latin
    let observations = await search(taxon, true, taxonIds[flower.name])
    let selected
    for (let attempt = 0; attempt < 2 && !selected; attempt++) {
      if (attempt) observations = await search(taxon, false, taxonIds[flower.name])
      for (const observation of observations) {
        const photo = (observation.photos || []).find(p => licenses.has(p.license_code) && !p.hidden && /\.jpg$/.test(p.url))
        if (photo) { selected = { observation, photo }; break }
      }
    }
    if (!selected) throw new Error(`未找到 ${taxon} 的自由许可开花照片`)
    const { observation, photo } = selected
    const imageUrl = photo.url.replace('/square.jpg', '/medium.jpg')
    const file = `flower_${String(i).padStart(2, '0')}.jpg`
    await run('curl', ['-L', '--fail', '--max-time', '30', '-sS', imageUrl, '-o', path.join(folder, file)])
    const buffer = await readFile(path.join(folder, file))
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('下载结果不是 JPEG')
    manifest[flower.name] = {
      file, width: photo.original_dimensions.width, height: photo.original_dimensions.height,
      source: 'iNaturalist', title: `${observation.taxon.name} · photo ${photo.id}`,
      sourceUrl: `https://www.inaturalist.org/photos/${photo.id}`,
      observationUrl: observation.uri,
      license: photo.license_code.toUpperCase(), author: photo.attribution,
      imageUrl, modification: '使用来源网站提供的 medium 尺寸图片'
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    console.log(`${flower.name}: ${observation.taxon.name} · ${photo.license_code} · ${buffer.length} bytes`)
  } catch (error) {
    console.error(`${flower.name}: ${error.message}`)
    process.exitCode = 1
  }
}
