#!/usr/bin/env python3
"""Prepare deterministic CloudBase upload files without changing cloud state."""
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'build' / 'illustration-cloud'
art = json.loads((ROOT / 'data/illustrations.json').read_text())
pending = json.loads((ROOT / 'data/illustration-pending.json').read_text())
overlap = set(art) & set(pending)
if overlap:
    raise ValueError(f'插画清单存在重复花名: {sorted(overlap)}')
art.update(pending)
for variant in ('original', 'detail', 'thumbnail'):
    (OUT / variant).mkdir(parents=True, exist_ok=True)

for name, record in art.items():
    source = ROOT / record['original']
    if not source.is_file():
        raise FileNotFoundError(source)
    key = 'flower_' + hashlib.sha1(name.encode()).hexdigest()
    original = OUT / 'original' / (key + '.png')
    detail = OUT / 'detail' / (key + '.jpg')
    thumbnail = OUT / 'thumbnail' / (key + '.jpg')
    if original.exists() and not os.path.samefile(source, original):
        original.unlink()
    if not original.exists():
        try:
            os.link(source, original)
        except OSError:
            shutil.copy2(source, original)
    if not detail.exists() or detail.stat().st_mtime < source.stat().st_mtime:
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82',
                        '-Z', '1000', str(source), '--out', str(detail)],
                       stdout=subprocess.DEVNULL, check=True)
    if not thumbnail.exists() or thumbnail.stat().st_mtime < source.stat().st_mtime:
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '65',
                        '-Z', '180', str(source), '--out', str(thumbnail)],
                       stdout=subprocess.DEVNULL, check=True)
print(f'已准备 {len(art)} 张原图、详情图及缩略图：{OUT}')
