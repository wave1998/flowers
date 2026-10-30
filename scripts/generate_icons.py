#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成花语亭小程序所需的 PNG 图标（纯标准库，无需 PIL）。
运行: python3 scripts/generate_icons.py
输出到 miniprogram/images/ 目录。
"""
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'miniprogram', 'images')

INACTIVE = (179, 169, 159, 255)   # #b3a99f
ACTIVE = (212, 105, 122, 255)     # #d4697a
AVATAR_BG = (240, 235, 228, 255)  # #f0ebe4
PETAL = (232, 154, 168, 255)
CENTER = (240, 196, 120, 255)

S = 81  # 微信 tabBar 推荐 81x81


def new_canvas(size=S, bg=None):
    if bg is None:
        buf = bytearray(size * size * 4)
    else:
        buf = bytearray()
        for _ in range(size * size):
            buf += bytes(bg)
    return buf, size


def put_pixel(buf, size, x, y, color):
    if 0 <= x < size and 0 <= y < size:
        i = (y * size + x) * 4
        buf[i:i + 4] = bytes(color)


def fill_circle(buf, size, cx, cy, r, color):
    r2 = r * r
    for y in range(int(cy - r), int(cy + r) + 1):
        for x in range(int(cx - r), int(cx + r) + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                put_pixel(buf, size, x, y, color)


def fill_rect(buf, size, x0, y0, x1, y1, color, radius=0):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if radius:
                # 圆角判断
                corners = [(x0 + radius, y0 + radius), (x1 - radius, y0 + radius),
                           (x0 + radius, y1 - radius), (x1 - radius, y1 - radius)]
                in_corner_zone = (x < x0 + radius or x > x1 - radius) and (y < y0 + radius or y > y1 - radius)
                if in_corner_zone:
                    cc = min(corners, key=lambda c: (x - c[0]) ** 2 + (y - c[1]) ** 2)
                    if (x - cc[0]) ** 2 + (y - cc[1]) ** 2 > radius * radius:
                        continue
            put_pixel(buf, size, x, y, color)


def draw_flower(buf, size, color, cx=None, cy=None, petal_r=None, dist=None, center_color=None):
    import math
    cx = size / 2 if cx is None else cx
    cy = size / 2 if cy is None else cy
    petal_r = size * 0.17 if petal_r is None else petal_r
    dist = size * 0.24 if dist is None else dist
    for i in range(5):
        ang = -math.pi / 2 + i * 2 * math.pi / 5
        px = cx + dist * math.cos(ang)
        py = cy + dist * math.sin(ang)
        fill_circle(buf, size, px, py, petal_r, color)
    fill_circle(buf, size, cx, cy, size * 0.11, center_color or color)


def draw_home(buf, size, color):
    """首页图标：小屋 + 屋顶上的一朵花"""
    # 屋顶（三角形）
    for y in range(12, 40):
        half = int((y - 12) * 30 / 28)
        fill_rect(buf, size, size // 2 - half, y, size // 2 + half, y, color)
    # 房身
    fill_rect(buf, size, 16, 40, size - 17, size - 12, color, radius=4)
    # 门（挖空）
    bg = (0, 0, 0, 0)
    fill_rect(buf, size, 34, 52, 46, size - 12, bg)


def draw_grid(buf, size, color):
    """花丛图标：2x2 圆角方格（瀑布流意象，错落）"""
    r = 5
    fill_rect(buf, size, 8, 10, 38, 44, color, radius=r)   # 左上（高）
    fill_rect(buf, size, 43, 10, 73, 36, color, radius=r)  # 右上（矮）
    fill_rect(buf, size, 8, 49, 38, 71, color, radius=r)   # 左下（矮）
    fill_rect(buf, size, 43, 41, 73, 71, color, radius=r)  # 右下（高）


def draw_person(buf, size, color):
    """我的图标：人形"""
    fill_circle(buf, size, size // 2, 26, 14, color)
    for y in range(48, size - 8):
        for x in range(size):
            dx = (x - size / 2) / 26.0
            dy = (y - (size + 6)) / 30.0
            if dx * dx + dy * dy <= 1:
                put_pixel(buf, size, x, y, color)


def draw_avatar(buf, size):
    """默认头像：奶油底 + 粉色小花"""
    draw_flower(buf, size, PETAL, center_color=CENTER)


def save_png(path, buf, size):
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: none
        raw += buf[y * size * 4:(y + 1) * size * 4]

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        c += struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
        return c

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    icons = {
        'tab-home': draw_home,
        'tab-list': draw_grid,
        'tab-mine': draw_person,
    }
    for name, fn in icons.items():
        for suffix, color in [('', INACTIVE), ('-active', ACTIVE)]:
            buf, size = new_canvas()
            fn(buf, size, color)
            save_png(os.path.join(OUT_DIR, f'{name}{suffix}.png'), buf, size)

    # 默认头像（稍大一点，160x160）
    a_size = 160
    buf, size = new_canvas(a_size, AVATAR_BG)
    draw_flower(buf, size, PETAL, petal_r=a_size * 0.16, dist=a_size * 0.22, center_color=CENTER)
    save_png(os.path.join(OUT_DIR, 'default-avatar.png'), buf, size)

    print('图标已生成到', os.path.abspath(OUT_DIR))


if __name__ == '__main__':
    main()
