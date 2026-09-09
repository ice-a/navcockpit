# 领航舱 NavCockpit（原「导航台」/ dns-dashboard，Nuxt 3 前后端一体）

Vue 3 + Nuxt 3 单体应用：前端页面与 server/api 路由（Nitro）在同一个项目里，**前后端不分离**。
集成五大板块，全部来自你指定的开源项目：

| 板块 | 数据来源 | 说明 |
| --- | --- | --- |
| 🌐 Cloudflare DNS | 原项目 | 自动读取 CF 托管网域的 DNS 记录 + 探活 |
| 🧭 网站导航 | [ice-a/nav_devops](https://github.com/ice-a/nav_devops) | 525 条链接，55 个分类归为 8 个大类，支持二次细分 + 搜索 |
| 🔥 热榜 | [ice-a/newsnow](https://github.com/ice-a/newsnow) | 服务端抓取：知乎/微博/百度/B站/GitHub/HN/V2EX/掘金/Product Hunt，带缓存 |
| 🤖 AI 资源台 | [ice-a/forword-api-record](https://github.com/ice-a/forword-api-record) | 中转站/工具/Skills/VPN/服务器/教程，**存远程 MongoDB**，管理密码鉴权 |
| 📝 文章转 MD | [ice-a/html_to_markdown_by_ai](https://github.com/ice-a/html_to_markdown_by_ai) | 服务端抓正文 + 图片转存图床 + Turndown + AI 总结 |
| 🎨 丑头像 | [GordenSun/uglyAvatar](https://github.com/GordenSun/uglyAvatar) | Canvas 引擎、seed 可复现、4 种物种、1024px PNG 导出 |
| 📦 GitHub | 原项目 | 用户公开仓库墙 |

另有：Google AdSense 广告位、Google Analytics 4、Microsoft Clarity（Bing 家族分析）、Bing UET 统计。

## 运行

```bash
npm install
copy .env.example .env   # 填入 CF_API_TOKEN、MONGODB_URI 等
npm run dev              # http://localhost:3000
```

## 部署

推荐 **Vercel**（Node runtime，mongoose 可直连远程 MongoDB，与 forword-api-record 相同路线）：

```bash
npm i -g vercel
vercel        # 首次按引导创建项目
```

在 Vercel 项目 Settings → Environment Variables 里配置 `.env` 中的所有变量后重新部署。
Nitro 会自动适配 Vercel（无需额外 preset）。也可部署到 Cloudflare Pages，但注意：
CF Workers 运行时不支持 mongoose 的 TCP 长连接，若部署 CF 需把 AI 资源台的存储换掉或用 Node preset 的自托管。

## 数据与安全

- **远程 MongoDB**：`MONGODB_URI` 只存在于服务端环境变量，浏览器永远不接触连接串；AI 资源台 7 个集合（stations/tools/skills/vpns/servers/tutorials/globalais）。
- **API Key 保管**：中转站的 apiKey 明文存 MongoDB，但接口返回前统一脱敏（`sanitizeStation`），前端永远拿不到。
- **管理鉴权**：写操作校验 `x-admin-password` 请求头（服务端比对 `ADMIN_PASSWORD`）；前端密码存 sessionStorage。
- **探活/模型拉取/AI 调用**：全部由服务端代理，规避浏览器 CORS，Key 不出服务端。

## 广告与分析配置

在 `.env` / Vercel 环境变量里填以下值即自动注入（留空完全不加载脚本）：

| 变量 | 用途 | 示例 |
| --- | --- | --- |
| `NUXT_PUBLIC_GA_ID` | Google Analytics 4 | `G-XXXXXXXXXX` |
| `NUXT_PUBLIC_ADSENSE_CLIENT` | Google AdSense（导航页有广告位） | `ca-pub-XXXXXXXXXXXXXXXX` |
| `NUXT_PUBLIC_CLARITY_ID` | Microsoft Clarity 行为分析 | 32 位 hex |
| `NUXT_PUBLIC_BING_UET_ID` | Bing UET 统计 | `12345678` |

AdSense 广告单元 ID 需在 `components/AdSlot.vue` 使用处传 `slot-id`。

## 已知限制（原"纯前端"要求下无法实现、改 Nuxt 后已解决的对照）

- ~~浏览器无法直连 MongoDB~~ → 改为 Nitro 服务端 mongoose 连接 ✅
- ~~热榜源被 CORS/风控拦截~~ → 服务端抓取 ✅（微博仍需 `WEIBO_COOKIE`；抖音/雪球/酷安等带强签名的源未移植）
- ~~HTML 抓取 CORS 限制~~ → 服务端抓取 + 图床转存 ✅
- AI 总结需要 Key：页面现填（存 localStorage，仅随请求发送）或服务端配置 `GLOBAL_AI_*`
- Vercel Cron 定时测活未实现，探活为打开页面时手动/自动触发
