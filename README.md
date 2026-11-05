# 🌸 花语亭 — 微信小程序（云开发）

一个基于微信云开发的花卉图鉴小程序：**每日花语推荐 + 搜索 + 瀑布流列表 + 花卉详情 + 我的收藏**。

内置 26 种花卉文字资料和来自 **iNaturalist** 的自由许可配图，通过 `initDatabase` 云函数导入云数据库和云存储。图片在部署前准备，云函数运行时无需检索或下载外部图片。

## 功能结构

| 模块 | 说明 |
| --- | --- |
| 首页 `pages/index` | 每日推荐一朵花（按日期轮换）、吸顶搜索入口、花间漫步推荐位 |
| 花丛 `pages/list` | 双列瀑布流、顶部搜索入口（不吸顶）、触底分页加载、悬浮返回顶部 |
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
    ├── generate_icons.py        # 生成 tabBar 图标与默认头像
    └── prepare_images.mjs       # 部署前准备配图、作者与许可信息
```

## 快速开始

### 1. 导入项目

1. 打开**微信开发者工具** → 导入项目 → 选择本目录
2. 将 `project.config.json` 中的 `appid` 替换为你自己的小程序 AppID（需已开通云开发）

> 底部导航已内置首页、花丛、我的三个图标，分别提供灰色默认态和粉色选中态。
> 如需重新生成图标，运行 `python3 scripts/generate_icons.py`，无需额外安装依赖。

### 2. 开通云开发并配置环境 ID

1. 开发者工具顶部点击「云开发」，开通环境
2. 复制**环境 ID**，填入 `miniprogram/app.js` 顶部的 `ENV_ID` 常量，再重新编译。请复制控制台环境信息中的「环境 ID」一行，不是纯数字的腾讯云主账号 ID、环境名称或以 `wx` 开头的小程序 AppID。只有已设置可用默认环境时才可以留空。
3. 右键 `cloudfunctions`，在「当前环境」中选择同一个环境。如果列表为空，请先开通云开发并创建环境，再刷新开发者工具。

### 3. 部署云函数

在开发者工具中，右键 `cloudfunctions/initDatabase` → **「上传并部署：云端安装依赖」**。

当前实现把集合准备、每朵花的高清图和缩略图上传分成独立调用，配图已打包在 `initDatabase/images/`，用于适配执行超时固定为 3 秒的体验环境。无需为了图片检索升级套餐。修改函数代码或配图后，需重新部署。

### 4. 初始化数据

编译运行小程序，首页会显示「初始化花卉数据」按钮，点击即可：

- 云函数自动创建 `flowers`、`favorites` 两个集合
- 按种子数据逐批导入，同一朵花的高清图和缩略图分两次调用上传
- 图片上传到云存储 `flowers/` 目录，资料写入 `flowers` 集合
- 按钮上显示导入进度，实际耗时取决于云函数调用与云存储上传速度

> 中断后再次点击会跳过已导入的花继续。每次调用通过游标推进，个别花的图片失败不会阻塞后续花卉，失败项会保留在首页，点击重试即可重新处理。修改此流程后需重新部署云函数。

### 常见加载问题

- `-501000` 且提示 `Environment not found` / `no default environment`：没有可用默认环境，或填写的环境 ID 不正确。先开通环境，再填写 `ENV_ID`，不能通过点击初始化解决。
- `FUNCTION_NOT_FOUND`：将 `initDatabase` 部署到 `ENV_ID` 对应的环境。
- 集合不存在：云环境已经连接成功，但尚未初始化，点击首页的初始化按钮。
- 权限不足：按下方表格配置集合权限。
- `FUNCTIONS_TIME_LIMIT_EXCEEDED`：先确认已部署包含 `images/` 的最新版本，再重试；已导入的数据会跳过，不会重复创建。

首页会分别显示环境、权限、连接错误和空数据库状态，失败后可点击「重新加载」。

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
  thumbnail: 'cloud://…',    // 最长边 400px 的独立缩略图，列表使用
  imgRatio: 1.0,             // 图片高宽比（瀑布流布局用）
  imageMeta: { source, title, license, author, sourceUrl, modification }  // 图片版权信息
}
```

`favorites` 集合：`{ _openid, flowerId, name, meaning, image, imgRatio, createdAt }`（存快照，列表展示无需二次查询）。

## 自定义数据

想增加/修改花卉，直接编辑 `cloudfunctions/initDatabase/seed.json`，重新部署云函数后再次点击初始化即可（已存在的按名字跳过；如需重新导入某朵花，先在数据库中删除该记录）。

修改花种后，运行 `node scripts/prepare_images.mjs` 准备新增花种的配图。脚本根据 `latin` 学名从 iNaturalist 检索自由许可照片并写入 `images/manifest.json`，再部署云函数。指定花名可重新准备对应配图，例如 `node scripts/prepare_images.mjs 玫瑰`。应检查下载结果与花种是否一致；少数名称歧义需在脚本中指定精确的分类 ID。旧的 `imageQuery` 字段仅为历史数据保留，不再用于运行时图片搜索。

下载配图后，使用安装了 Pillow 的 Python 运行 `python3 scripts/prepare_image_variants.py`，准备来源网站的 large 高清图和最长边 400px 的缩略图，再部署 `initDatabase`。高清图写入 `image`，缩略图写入 `thumbnail`；已有花卉升级时保留文档 ID 和创建时间。列表、搜索结果和首页的小卡片优先加载缩略图，详情页与预览使用高清图。旧收藏没有缩略图时会回退到原图片。

## 版权说明

当前配图从 iNaturalist 的公开照片中选取，仅使用 **CC0 / CC BY / CC BY-SA** 许可。原作者署名、许可、图片来源页和尺寸说明随图片打包在 `images/manifest.json`，导入后写入每条花卉记录的 `imageMeta`，详情页展示署名并支持复制来源链接。复用配图时需保留对应许可与署名；CC BY-SA 图片继续按相同许可提供。

花卉文字资料（花语、介绍、传说、养护）为原创整理。

## 本地验证

无需安装依赖，使用 Node.js 运行 `node --test tests/*.test.js`，覆盖环境错误、首页空数据与失败状态、搜索和分批初始化流程。云环境连接、云函数部署和图片下载仍需在微信开发者工具中验证。

## 账号与加载体验（2026-11-02）

- 新增 `pages/account/account` 账号模块：主动登录、选择头像、填写昵称、授权绑定手机号、退出登录；“我的”头像/昵称及资料入口均跳转此页。游客点收藏先登录，取消不写收藏，登录成功恢复一次收藏。
- `userAccount` 云函数从微信云上下文获取身份，不接受客户端传入的用户 ID；昵称通过 `security.msgSecCheck` 审核，手机号仅接受微信 `getPhoneNumber` 返回的 code，在服务端换取号码。完整号码不返回前端。`userProfiles` 应设置为**仅管理端可读写**；客户端统一经过云函数访问。头像云存储目录使用用户身份哈希区分，存储权限保持创建者可写。
- 微信后台需要为实际使用的头像选择、昵称填写及手机号能力完成隐私声明与能力配置。手机号能力是否开放取决于小程序后台的主体/认证/接口资格；未开放时会明确提示，不影响浏览、登录和收藏。真机需要验证头像与手机号系统授权弹窗。
- 公开资料随小程序包附带，列表、搜索、详情文字离线可用。详情先显示本地缩略图，再淡入高清图；只在后台刷新当前花卉的云图片，缓存 10 分钟并合并并发请求。收藏查询单独运行；游客不查询收藏。
- 详情有骨架屏、花朵动画、高清图失败时的缩略图回退；列表返回顶部按钮为半透明圆形花朵，读取数据时旋转。

### 资料范围与维护

当前目录包含 **261 条花语资料**（含不同物种和园艺类型，并非声称 261 个不同物种）。纯花色条目归入对应花卉详情，其编辑意象解读可在详情中查看和搜索，旧花色链接可解析到对应花卉。当前 156 条使用 AI 生成的彩铅插画；其余条目保留可追溯来源的照片或通用占位插画。

彩铅插画登记在 `data/illustrations.json`，高清原图和旧缩略图备份在与本项目同级的 `../flowers-image-backup/`。小程序使用云图，云图不可用时显示包内通用占位图；文字目录仍随包提供。

云端迁移：运行 `python3 scripts/prepare_illustration_cloud.py`，在 `build/illustration-cloud/` 生成以稳定 ID 命名的 `thumbnail/`、`detail/` 和 `original/`。缩略图可独立迁移：将 `thumbnail/` 上传至云环境的 `illustration-cloud/` 目录，核对文件数量及读取权限，再将父目录的 `cloud://…/illustration-cloud` 文件 ID 前缀写入 `data/illustration-thumbnail-cloud-prefix.txt`，运行 `python3 scripts/build_catalog.py`。已有收藏优先使用当前目录图片地址。详情图和原图也上传并核对完成后，可另将其父目录前缀写入 `data/illustration-cloud-prefix.txt` 并重建，启用高清图；如未设置缩略图专用前缀，该前缀也用于缩略图。对应文件上传及核对完成前不要设置前缀。

在开发者工具和真机确认云图均可加载后，再在打包配置中排除 `miniprogram/images/illustrations/` 并确认实际上传包大小；保留本地文件以便回滚。回滚时移除相关前缀文件、重建目录并恢复打包包含该目录。列表、首页、搜索和收藏加载失败时显示通用占位图；详情页的失败展示需结合正在进行的布局修改验证。云存储可能产生费用；本地准备不代表已上传或发布。

花语内容继续采用项目原有编辑解读及标明来源的历史译文，未复制日出日落网站的数据库。本地目录是列表和搜索的数据来源；云端已有记录不会因重新运行初始化而自动删除或覆盖，部署小程序前应另行规划云端数据迁移和收藏兼容。

新增内容区分编辑意象解读与历史花语译文，历史译文来源为 Kate Greenaway 的 [Language of Flowers (1884)](https://www.gutenberg.org/ebooks/31591)。花语是文化表达，存在时代、地域和语境差异。编辑解读不冒充统一传统花语。

资料源：`cloudfunctions/initDatabase/seed.json`（原有 26 条详细资料）与 `data/flower-meanings.tsv`（扩展目录）。运行 `python3 scripts/build_catalog.py` 重新生成导入数据与 `miniprogram/data/flowers.js`。微信逻辑层使用 JS 模块而非直接 require JSON。缩略图最长边 400 像素，高清图独立使用；当前整个小程序源目录约 1.1 MB。

部署 `cloudfunctions/userAccount` 和新版 `cloudfunctions/initDatabase` 时选择“云端安装依赖”。`initDatabase` 文字条目不要求配图，已有照片分高清/缩略图两次调用，保留文档 ID 和收藏关联。公开目录无需等待云端导入即可浏览；导入函数用于同步云端镜像。

验证：`node --test tests/cloud.test.js`。覆盖离线目录完整性、分页/搜索、详情先显示、登录/取消/恢复收藏、身份隔离、昵称审核与手机号授权码校验等。

头像昵称能力参考：[微信小程序官方头像昵称组件说明](https://github.com/wechat-miniprogram/mp-user-avatar/blob/master/README.md)。

### 插画云接入与本地备份（2026-11-05）

插画目录使用 `data/illustration-cloud-prefix.txt` 指向云存储；原图及旧缩略图移至同级 `flowers-image-backup/`。小程序上传排除 `images/illustrations/` 和 `images/thumbs/`，仅保留通用占位与界面图标。运行构建脚本需要保留该同级备份。云图加载失败时显示通用占位图。云端详情图和原图的完整性、客户端读取权限尚需在合适时确认。云函数 `initDatabase/images/` 的历史照片是独立云函数资源，不属于小程序代码包。
