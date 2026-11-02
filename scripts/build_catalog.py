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
manifest = json.loads((ROOT / 'cloudfunctions/initDatabase/images/manifest.json').read_text())
public=[]
for row in seed:
    if 'meaningKind' not in row:
        row['meaningKind']='common'; row['meaningNote']='常见花卉文化寓意，不同地区与时代的表达可能不同。'
    row.update(gifting_for(row))
    item={k:v for k,v in row.items() if k!='imageQuery'}
    item['_id']='flower_'+hashlib.sha1(row['name'].encode()).hexdigest()
    image=manifest.get(row['name'])
    if image:
        thumb=image['thumbnailFile']; shutil.copyfile(ROOT/'cloudfunctions/initDatabase/images'/thumb, ROOT/'miniprogram/images/thumbs'/thumb)
        item.update(thumbnail='/images/thumbs/'+thumb, image=image['imageUrl'].replace('/medium.', '/large.'),
            imgRatio=max(.6,min(1.6,image['height']/image['width'])),
            imageMeta={k:image[k] for k in ['source','title','sourceUrl','license','author','modification']})
    else:
        item.update(image='/images/flower-placeholder.png',thumbnail='/images/flower-placeholder.png',imagePlaceholder=True)
    public.append(item)
assert len(seed)>=300 and len({r['name'] for r in seed})==len(seed)
(ROOT/'cloudfunctions/initDatabase/seed.json').write_text(json.dumps(seed,ensure_ascii=False,indent=2)+'\n')
(ROOT/'miniprogram/data/flowers.js').write_text('module.exports = '+json.dumps(public,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'{len(public)} entries; {len(manifest)} photographs; {len(history)} sourced historical meanings')
