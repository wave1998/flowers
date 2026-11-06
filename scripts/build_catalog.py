#!/usr/bin/env python3
"""Build the public offline catalogue; personal data never enters this bundle."""
import hashlib, json, shutil
from pathlib import Path
from gifting_guide import gifting_for
ROOT = Path(__file__).resolve().parents[1]
seed = json.loads((ROOT / 'cloudfunctions/initDatabase/seed.json').read_text())[:26]
aliases = {'蓝花丹','小苍兰','木春菊','朱槿','叶子花','日日春','双喜藤','南非万寿菊','黄花菜','天堂鸟','慈菇','水罂粟','假龙头花','桔梗风铃草'}
# Historical translations are kept distinct from our contemporary editorial interpretations.
history = {
 '铃兰': ('Lily of the Valley', 'Return of happiness.', '幸福归来'),
 '铁线莲': ('Clematis', 'Mental beauty.', '内心之美'),
 '洋甘菊': ('Camomile', 'Energy in adversity.', '逆境中的力量'),
 '百日草': ('Zinnia', 'Thoughts of absent friends.', '思念远方的朋友'),
 '雪滴花': ('Snowdrop', 'Hope.', '希望'),
 '白百合': ('Lily, White', 'Purity. Sweetness.', '纯洁、温柔'),
 '粉飞燕草': ('Larkspur, Pink', 'Fickleness.', '心意易变'),
 '紫飞燕草': ('Larkspur, Purple', 'Haughtiness.', '高傲'),
 '迷迭香': ('Rosemary', 'Remembrance.', '铭记'),
 '三色堇': ('Pansy', 'Thoughts.', '思念'),
 '杏花': ('Almond, Flowering', 'Hope.', '希望'),
 '花毛茛': ('Ranunculus', 'You are radiant with charms.', '魅力四射'),
}
# Almond is not apricot: omit ambiguous or mismatched botanical names.
history.pop('杏花')
existing = {x['name'] for x in seed}
for line in (ROOT / 'data/flower-meanings.tsv').read_text().splitlines():
    if not line.strip(): continue
    name, meaning = line.split('|')
    if name in aliases or name in existing: continue
    row = dict(name=name, meaning=meaning, tags=meaning.split('、'), colors=[], imgRatio=1,
        meaningKind='editorial', meaningNote='花语亭编辑意象解读，并非统一的传统花语。',
        description=f'花语亭为「{name}」选取「{meaning}」作为表达心意的灵感。花语会随地域、时代与赠送场景变化；送花时，写下自己的话更能传达心意。')
    if name in history:
        en, original, translated = history[name]
        row.update(meaning=translated, tags=translated.split('、'), nameEn=en, meaningKind='historical',
            meaningNote='译自 Kate Greenaway《Language of Flowers》（1884）；历史花语不代表当代各地的统一用法。',
            meaningSource=dict(title='Language of Flowers · Kate Greenaway (1884)',url='https://www.gutenberg.org/ebooks/31591',entry=en,original=original),
            description=f'1884 年的《Language of Flowers》将「{en}」与「{translated}」联系起来。这是一种历史文化表达；今天赠送「{name}」时，也可以赋予它属于你们的含义。')
    seed.append(row); existing.add(name)
# Collapse colour-only entries into their existing parent without changing IDs of
# either the parent or old shared links and saved favourites.
parents = {r['name']: r for r in seed}
colour_parents = {'玫瑰', '郁金香', '百合', '康乃馨', '绣球花', '洋桔梗', '飞燕草', '非洲菊', '芍药', '牡丹', '风信子', '睡莲'}
special = {'红梅': '梅花', '白梅': '梅花', '蓝绣球': '绣球花', '粉绣球': '绣球花', '白绣球': '绣球花', '桔梗花（白）': '桔梗', '桔梗花（紫）': '桔梗'}
merged = {}
for row in list(seed[26:]):
    name = row['name']
    target = special.get(name)
    if not target:
        for prefix in ('香槟', '双色', '红', '白', '粉', '黄', '橙', '紫', '蓝'):
            candidate = name[len(prefix):] if name.startswith(prefix) else ''
            if candidate in colour_parents:
                target = candidate
                break
    if not target or target not in parents: continue
    merged.setdefault(target, []).append(row)
    seed.remove(row)
for parent, variants in merged.items():
    row = parents[parent]
    row['colorMeanings'] = [{'name': v['name'], 'meaning': v['meaning']} for v in variants]
    row['legacyIds'] = ['flower_'+hashlib.sha1(v['name'].encode()).hexdigest() for v in variants]
# Rebuild public entries above after merging on subsequent section.
assert len(seed)>=200 and len({r['name'] for r in seed})==len(seed)

# Independently maintained botanical facts survive regeneration of the catalog.
details = {}
for number, line in enumerate((ROOT / 'data/flower-details.tsv').read_text().splitlines(), 1):
    if not line.strip():
        continue
    fields = line.split('|')
    if len(fields) != 7 or not all(fields):
        raise ValueError(f'flower-details.tsv 第 {number} 行应包含花名及六项资料')
    name, family, season, origin, colors, description, care = fields
    if name in details:
        raise ValueError(f'flower-details.tsv 中花名重复：{name}')
    details[name] = dict(family=family, bloomSeason=season, origin=origin,
                         colors=colors.split('、'), description=description, care=care)
unknown = set(details) - {row['name'] for row in seed}
if unknown:
    raise ValueError(f'花卉资料不在目录中：{sorted(unknown)}')
for row in seed:
    row.update(details.get(row['name'], {}))
    missing = [field for field in ('family', 'bloomSeason', 'origin', 'colors', 'meaning', 'description', 'care') if not row.get(field)]
    if missing:
        raise ValueError(f"{row['name']} 缺少必填资料：{', '.join(missing)}")

manifest = json.loads((ROOT / 'cloudfunctions/initDatabase/images/manifest.json').read_text())
illustrations = json.loads((ROOT / 'data/illustrations.json').read_text())
pending_illustrations = json.loads((ROOT / 'data/illustration-pending.json').read_text())
prefix_file = ROOT / 'data/illustration-cloud-prefix.txt'
cloud_prefix = prefix_file.read_text().strip().rstrip('/') if prefix_file.exists() else ''
thumb_prefix_file = ROOT / 'data/illustration-thumbnail-cloud-prefix.txt'
thumb_prefix = thumb_prefix_file.read_text().strip().rstrip('/') if thumb_prefix_file.exists() else cloud_prefix
if cloud_prefix and (not cloud_prefix.startswith('cloud://') or '\n' in cloud_prefix):
    raise ValueError('illustration-cloud-prefix.txt 应填写云存储目录的 cloud:// 文件 ID 前缀')
if thumb_prefix and (not thumb_prefix.startswith('cloud://') or '\n' in thumb_prefix):
    raise ValueError('illustration-thumbnail-cloud-prefix.txt 应填写云存储目录的 cloud:// 文件 ID 前缀')
public=[]
for row in seed:
    if 'meaningKind' not in row:
        row['meaningKind']='common'; row['meaningNote']='常见花卉文化寓意，不同地区与时代的表达可能不同。'
    row.update(gifting_for(row))
    item={k:v for k,v in row.items() if k!='imageQuery'}
    item['_id']='flower_'+hashlib.sha1(row['name'].encode()).hexdigest()
    image=manifest.get(row['name'])
    if row['name'] in illustrations or (thumb_prefix and row['name'] in pending_illustrations):
        art = illustrations.get(row['name']) or pending_illustrations[row['name']]
        fallback = '/images/flower-placeholder.png'
        assert (ROOT / art['original']).exists()
        item.update(thumbnail=fallback, image=fallback, fallbackThumbnail=fallback, imageKind='ai-illustration', imgRatio=1)
        if thumb_prefix:
            thumb = f"{thumb_prefix}/thumbnail/{item['_id']}.jpg"
            item.update(thumbnail=thumb, image=thumb)
        if cloud_prefix:
            # 部署者仅在上传并核对三种图片后填写目录前缀。
            item.update(image=f"{cloud_prefix}/detail/{item['_id']}.jpg",
                        originalImage=f"{cloud_prefix}/original/{item['_id']}.png")
    elif image:
        item.update(thumbnail='/images/flower-placeholder.png', image=image['imageUrl'].replace('/medium.', '/large.'),
            imgRatio=max(.6,min(1.6,image['height']/image['width'])),
            imageMeta={k:image[k] for k in ['source','title','sourceUrl','license','author','modification']})
    else:
        item.update(image='/images/flower-placeholder.png',thumbnail='/images/flower-placeholder.png',imagePlaceholder=True)
    public.append(item)
(ROOT/'cloudfunctions/initDatabase/seed.json').write_text(json.dumps(seed,ensure_ascii=False,indent=2)+'\n')
(ROOT/'miniprogram/data/flowers.js').write_text('module.exports = '+json.dumps(public,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'{len(public)} entries; {len(manifest)} photographs; {len(history)} sourced historical meanings')
