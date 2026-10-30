# 🌸 花语亭 — 微信小程序（云开发）

一个基于微信云开发的花卉图鉴小程序：**每日花语推荐 + 搜索 + 瀑布流列表 + 花卉详情 + 我的收藏**。

花卉资料与图片来自 **Wikimedia Commons**（自由版权/公有领域图库），通过 `initDatabase` 云函数一键导入云数据库和云存储，无需自己准备素材。

## 功能结构

| 模块 | 说明 |
| --- | --- |
| 首页 `pages/index` | 每日推荐一朵花（按日期轮换）、搜索入口、花间漫步推荐位 |
| 花丛 `pages/list` | 双列瀑布流，按图片宽高比智能分列，触底分页加载 |
| 我的 `pages/mine` | 微信头像昵称设置、收藏统计、我的收藏（长按可取消） |
| 详情 `pages/detail` | 花语、科属/花期/原产地、详细介绍、传说、养护贴士、收藏/分享 |
| 搜索 `pages/search` | 花名/英文名/别名/花语/标签模糊搜索，防抖输入，搜索历史 |

## 目录结构

```
flowers/
├── project.config.json          # 项目配置（需替换 appid）
├── miniprogram/                 # 小程序前端
│   ├── app.js / app.json / app.wxss
│   ├── images/                  # tabBar 图标（由脚本生成）
│   ├── pages/                   # 5 个页面
│   └── utils/                   # 工具与云数据库封装
├── cloudfunctions/
│   └── initDatabase/            # 数据初始化云函数（含 26 种花的种子数据 seed.json）
└── scripts/
    └── generate_icons.py        # 生成 tabBar 图标与默认头像
```

## 快速开始

### 1. 导入项目

1. 打开**微信开发者工具** → 导入项目 → 选择本目录
2. 将 `project.config.json` 中的 `appid` 替换为你自己的小程序 AppID（需已开通云开发）

> 开箱即用：底部导航默认为纯文字样式，无需任何图片资源即可编译运行。
> 如需带图标的 tabBar，运行 `python3 scripts/generate_icons.py` 生成 PNG 图标后，
> 在 `miniprogram/app.json` 的 tabBar 每一项中补回 `"iconPath": "images/tab-xxx.png"` 和 `"selectedIconPath": "images/tab-xxx-active.png"`（脚本生成的文件名与之一一对应）。

### 2. 开通云开发并配置环境 ID

1. 开发者工具顶部点击「云开发」，开通环境（免费额度足够使用）
2. 复制环境 ID，填入 `miniprogram/app.js` 顶部的 `ENV_ID` 常量（只有一个环境时可留空，会自动使用默认环境）

### 3. 部署云函数

在开发者工具中，右键 `cloudfunctions/initDatabase` → **「上传并部署：云端安装依赖」**。

建议顺手在云开发控制台 → 云函数 → initDatabase → 配置中，把**超时时间调到 60 秒**（函数需要下载图片，默认 20 秒可能不够）。

### 4. 初始化数据

编译运行小程序，首页会显示「初始化花卉数据」按钮，点击即可：

- 云函数自动创建 `flowers`、`favorites` 两个集合
- 按种子数据逐批（每批 5 种）从 Wikimedia Commons 检索自由版权图片
- 图片上传到云存储 `flowers/` 目录，资料写入 `flowers` 集合
- 按钮上会显示进度，全部完成约需 1~3 分钟

> 导入是幂等的，中断后再次点击会跳过已导入的花继续。个别花若没搜到合适图片会记录失败并可重试。

### 5. 设置数据库权限（重要）

云开发控制台 → 数据库：

| 集合 | 权限 |
| --- | --- |
| `flowers` | **所有用户可读**（仅管理端可写） |
| `favorites` | **仅创建者可读写** |

## 数据模型

`flowers` 集合单条记录：

```js
{
  name: '向日葵',            // 中文名（搜索字段）
  nameEn: 'Sunflower',      // 英文名（搜索字段）
  latin: 'Helianthus annuus',
  alias: '朝阳花',           // 别名（搜索字段）
  family: '菊科向日葵属',
  origin: '北美洲',
  bloomSeason: '7-9月',
  colors: ['黄色'],
  meaning: '沉默的爱、忠诚、阳光',  // 花语（搜索字段）
  tags: ['阳光', '忠诚', '希望'],   // 标签（搜索字段）
  legend: '……',              // 花间传说
  description: '……\n……',     // 详细介绍（\n 分段）
  care: '……',                // 养护贴士
  image: 'cloud://…',        // 云存储 fileID
  imgRatio: 1.0,             // 图片高宽比（瀑布流布局用）
  imageMeta: { source, title, license, author }  // 图片版权信息
}
```

`favorites` 集合：`{ _openid, flowerId, name, meaning, image, imgRatio, createdAt }`（存快照，列表展示无需二次查询）。

## 自定义数据

想增加/修改花卉，直接编辑 `cloudfunctions/initDatabase/seed.json`，重新部署云函数后再次点击初始化即可（已存在的按名字跳过；如需重新导入某朵花，先在数据库中删除该记录）。

每条数据的 `imageQuery` 是 Wikimedia Commons 的搜索词，可改成更精确的文件描述以锁定特定图片。

## 版权说明

图片由云函数从 Wikimedia Commons 实时检索，仅选取 **公有领域 / CC0 / CC BY / CC BY-SA** 许可的图片，作者与许可信息保存在每条记录的 `imageMeta` 字段中，可在应用内或后台展示以完成署名要求（CC BY 许可需要署名）。

花卉文字资料（花语、介绍、传说、养护）为原创整理。
