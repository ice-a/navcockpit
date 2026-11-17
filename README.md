# 渡口 Ferry

从这里去别处。纯静态的资源库，**站点导航 + AI 资源 + 站内文章**合成一棵树。
Vite + Vue 3 构建，没有任何服务端；内容全部读 `public/data/` 下的 JSON，改数据不用改代码。

- 前端：Vue 3（Composition API）+ 原生 CSS 设计令牌，无组件库，浅色/深色双主题
- 数据：`public/data/library.json`（目录）+ `articles.json`（文章正文，点开才加载）
- 部署：`dist/` 直接丢 Cloudflare Pages

## 目录

```
navcockpit
├─ index.html               入口
├─ vite.config.js           构建配置（outDir: dist）
├─ public/
│  ├─ _headers              Cloudflare Pages 缓存与安全头
│  └─ data/                 站点的全部内容，见下节
├─ src/
│  ├─ main.js               挂载、首屏前落主题
│  ├─ App.vue               外壳：顶栏品牌、内容区、快捷键
│  ├─ lib/store.js          设置持久化 + JSON 加载缓存 + 统计脚本注入
│  ├─ lib/format.js         首字母/配色/域名/日期等小工具
│  ├─ styles/base.css       设计令牌与所有样式
│  └─ components/           LibraryView / LinkCard / TutorialReader / 命令面板 / 设置抽屉 …
├─ scripts/
│  ├─ build-data.mjs        data-export → library.json + articles.json（合并逻辑在这里）
│  ├─ export-mongo.mjs      从 MongoDB 导出原始集合到 data-export/（一次性迁移用）
│  └─ export-tech-docs.mjs  资源库里的技术类内容 → less_is_more_cn 文档站
└─ data-export/             从 Mongo 导出的原始 JSON（已剔除 apiKey，可不入库）
```

## JSON 数据（改内容只需动这里）

| 文件 | 作用 |
| --- | --- |
| `public/data/site.json` | 站点名/英文名/品牌字、顶部板块 `tabs`、顶栏社交入口 `social`、一言接口 `hitokoto`、页脚链接、统计 ID |
| `public/data/library.json` | 资源库：`sections[].categories[].items[]`，条目 `kind` 为 `link`（外链）或 `article`（站内文章） |
| `public/data/articles.json` | 文章正文（Markdown 字符串，前端用 marked 渲染），按 `id` 与目录里的 `articleId` 对应 |

`site.json` 里的 `tabs` 只有一条时顶栏不显示板块切换，加第二条即自动出现：

```json
"tabs": [
  { "id": "library", "label": "资源库", "icon": "apps" }
]
```

顶栏图标入口（GitHub 等）由 `social` 提供，`icon` 取 `src/components/Icon.vue` 里的图标名：

```json
"social": [
  { "icon": "github", "label": "GitHub · ice-a", "url": "https://github.com/ice-a" }
]
```

这些图标在 720px 以下的窄屏会隐藏（页脚仍有同样链接），避免挤压顶栏。

顶栏中间那句一言来自开源的 [hitokoto](https://hitokoto.cn) 接口，点击可换一句：

```json
"hitokoto": {
  "enabled": true,
  "endpoint": "https://v1.hitokoto.cn/?c=d&c=i&encode=json"
}
```

`enabled: false` 即关闭；`c` 是分类（`d` 文学、`i` 诗词），接口不可用时这块直接不显示。

每张资源卡右上角有一个分享图标：鼠标移入或键盘聚焦时露出，点击优先调系统分享面板，桌面端则把该条链接复制到剪贴板并短暂显示对勾（文章卡片分享的是站点地址）。触摸设备上按钮半透明常驻。

## 命令

```bash
pnpm install
pnpm dev            # 本地开发
pnpm build          # 构建到 dist/
pnpm preview        # 预览构建结果

pnpm data:build     # 由 data-export/ 重新生成 library.json 与 articles.json
pnpm data:docs      # 把技术类内容同步到 less_is_more_cn 文档站
```

## 部署到 Cloudflare Pages

| 项 | 值 |
| --- | --- |
| 构建命令 | `pnpm build` |
| 输出目录 | `dist` |
| 环境变量 | 无（统计 ID 写在 `site.json` 里） |

`public/_headers` 已配置：`/data/*` 缓存 5 分钟、`/assets/*` 长缓存，其余带 `nosniff`。

## 数据结构与合并规则

`scripts/build-data.mjs` 把 Mongo 导出的多个集合合成一棵树：

- **导航**：`navcategories` 提供「大类 → 分类」，`navlinks` 按 `catelog` 落到分类；没有对应分类的链接进「其他」。
- **AI 资源**：`stations / tools / skills / vpns / servers` 通过 `HUB_MERGE` 映射并入大类，
  例如中转站 → `AI 工具/中转站`、Skills → `AI 工具/Skills`、VPN 与 VPS → `代理防护`、
  港卡币卡与 AI 会员 → `商业推广`；其余板块（如 hubitems 里的自定义板块）进「其他」。
- **教程**：`tutorials`（`status: published`）作为 `kind: article` 条目并入 `学习提升/教程`，
  正文单独写进 `articles.json`，列表页只带 `articleId`，点开才加载。
- **去重**：外链按 `url + name`，文章按标题；中转站的 `apiKey` / `keyId` 一律不导出。

旧 Nuxt 代码与旧配置放在 `.legacy/`（未纳入构建，也没有 git 历史，确认无用后可整目录删掉）。
`.nuxt/`、`.output/` 是旧构建残留，同样可以删除。

## 技术内容去了哪

资源库里 AI 工具 / 开发工具 / 采集自动化 / 逆向安全 / 学习提升 五个大类由 `pnpm data:docs`
生成到 `../less_is_more_cn/docs/07技术资源/`（VitePress 文档站，按分类成表格）。
数据以 `library.json` 为准，改完重跑一次即可同步。

## 已知限制

- 纯静态，没有后台管理与账号体系；改内容 = 改 JSON 再构建。
- 资源规模约 500 条，全部在一份 JSON 里，首屏一次拉完；文章正文按需另外加载。
- 站内文章没有目录锚点与全文检索，长文靠浏览器内查找。