#!/usr/bin/env python3
"""为已核实许可的配图准备高清图与缩略图，需要 Pillow 和 curl。"""
import io
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageOps

FOLDER = Path(__file__).resolve().parents[1] / 'cloudfunctions/initDatabase/images'
MANIFEST = FOLDER / 'manifest.json'
images = json.loads(MANIFEST.read_text())

for name, meta in images.items():
    thumbnail = FOLDER / ('thumb_' + meta['file'])
    if meta.get('assetVersion') == 2 and thumbnail.exists():
        print(name + ': 已准备', flush=True)
        continue
    url = meta['imageUrl'].replace('/medium.jpg', '/large.jpg')
    result = subprocess.run(['curl', '-L', '--fail', '--retry', '2', '--max-time', '30', '-sS', url], check=True, capture_output=True)
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(result.stdout))).convert('RGB')
    image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
    image.save(FOLDER / meta['file'], 'JPEG', quality=86, optimize=True)
    small = image.copy()
    small.thumbnail((400, 400), Image.Resampling.LANCZOS)
    small.save(thumbnail, 'JPEG', quality=72, optimize=True)
    meta.update({
        'thumbnailFile': thumbnail.name, 'assetVersion': 2,
        'hdWidth': image.width, 'hdHeight': image.height,
        'thumbnailWidth': small.width, 'thumbnailHeight': small.height,
        'modification': '高清图基于来源 large 图片缩放压缩；缩略图最长边 400 像素，未裁切'
    })
    MANIFEST.write_text(json.dumps(images, ensure_ascii=False, indent=2) + '\n')
    print(f'{name}: 高清 {image.width}x{image.height} / 缩略图 {small.width}x{small.height}', flush=True)
