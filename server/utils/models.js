// AI 资源台数据模型（移植自 ice-a/forword-api-record 的 8 个 Schema，合并为常用 7 个集合）
import mongoose from 'mongoose';

const { Schema } = mongoose;

// 公共字段：备注/排序/状态
const base = {
  desc: { type: String, default: '' },
  remark: { type: String, default: '' },
  sort: { type: Number, default: 0 },
  status: { type: String, default: 'active' }, // active | inactive
};

const schemas = {
  // OpenAI 兼容中转站
  Station: new Schema(
    {
      name: { type: String, required: true },
      baseURL: { type: String, required: true },
      siteURL: { type: String, default: '' },
      apiKey: { type: String, default: '' }, // 明文存库，绝不下发前端（接口返回前 sanitize）
      keyId: { type: String, default: '' },
      models: { type: [String], default: [] },
      isGlobalAi: { type: Boolean, default: false },
      ...base,
    },
    { timestamps: true },
  ),
  // 开发工具推荐
  Tool: new Schema(
    {
      name: { type: String, required: true },
      tags: { type: [String], default: [] },
      install: { type: String, default: '' },
      home: { type: String, default: '' },
      detail: { type: [String], default: [] },
      ...base,
    },
    { timestamps: true },
  ),
  // Skills 推荐
  Skill: new Schema(
    {
      name: { type: String, required: true },
      web: { type: String, default: '' },
      intro: { type: String, default: '' },
      ...base,
    },
    { timestamps: true },
  ),
  // VPN 推荐
  Vpn: new Schema(
    {
      name: { type: String, required: true },
      url: { type: String, default: '' },
      ...base,
    },
    { timestamps: true },
  ),
  // 服务器清单（分类连通性探测）
  Server: new Schema(
    {
      name: { type: String, required: true },
      category: { type: String, default: '' },
      url: { type: String, default: '' },
      region: { type: String, default: '' },
      ...base,
    },
    { timestamps: true },
  ),
  // 教程（Markdown，浏览量/点赞）
  Tutorial: new Schema(
    {
      title: { type: String, required: true },
      category: { type: String, default: '' },
      summary: { type: String, default: '' },
      cover: { type: String, default: '' },
      content: { type: String, default: '' },
      tags: { type: [String], default: [] },
      views: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      status: { type: String, default: 'published' }, // draft | published
      sort: { type: Number, default: 0 },
      remark: { type: String, default: '' },
      desc: { type: String, default: '' },
    },
    { timestamps: true },
  ),
  // 全局 AI 配置（供服务端代理 AI 调用；不存在/不可用时回退环境变量 GLOBAL_AI_*）
  GlobalAi: new Schema(
    {
      name: { type: String, default: '全局 AI' },
      baseURL: { type: String, default: '' },
      apiKey: { type: String, default: '' },
      models: { type: [String], default: [] },
    },
    { timestamps: true },
  ),
  // 热门 GitHub 用户（原 public/creators.json，迁移到本地库；用户搜索也会入库）
  Creator: new Schema(
    {
      login: { type: String, required: true, unique: true, index: true },
      note: { type: String, default: '' },
      addedByUser: { type: Boolean, default: false },
      sort: { type: Number, default: 0 },
    },
    { timestamps: true },
  ),
  // 网站导航分类（后台可增删改）。key 为稳定标识（与链接 catelog 对应），
  // name 为可改的展示名；aliases 存放历史 catelog 值，匹配链接时一并纳入。
  NavCategory: new Schema(
    {
      key: { type: String, required: true, unique: true, index: true }, // 稳定 id
      name: { type: String, required: true }, // 展示名（可改名）
      group: { type: String, default: '其他' }, // 大类
      icon: { type: String, default: '' },
      sort: { type: Number, default: 0 },
      status: { type: String, default: 'active' }, // active | inactive
      aliases: { type: [String], default: [] }, // 历史 catelog 值
    },
    { timestamps: true },
  ),
  // 网站导航链接（原 public/link.json，迁到 MongoDB 便于后台增删改）
  NavLink: new Schema(
    {
      name: { type: String, required: true },
      url: { type: String, required: true },
      catelog: { type: String, default: '' }, // 对应 NavCategory.key
      group: { type: String, default: '' }, // 冗余存大类，便于列表筛选
      desc: { type: String, default: '' },
      sort: { type: Number, default: 0 },
      status: { type: String, default: 'active' }, // active | inactive
    },
    { timestamps: true },
  ),

  // 分享快照：每条分享一个随机 sid，链接形如 /?share=<sid>。
  // 存的是快照（标题/描述/链接/头像参数），源记录被删后分享页仍可访问。
  Share: new Schema(
    {
      sid: { type: String, required: true, unique: true, index: true },
      type: { type: String, default: 'card' }, // hub | nav | repo | user | dns | hot | avatar
      coll: { type: String, default: '' }, // hub 集合名（stations / tools / ...）
      refId: { type: String, default: '' }, // 源文档 _id / 导航站的 URL；同一 coll+refId 复用同一个 sid
      title: { type: String, default: '' },
      desc: { type: String, default: '' },
      url: { type: String, default: '' },
      badge: { type: String, default: '' }, // 海报左上角标签，如「🧰 工具」
      avatar: {
        engine: { type: String, default: 'A' }, // A | B | C
        species: { type: String, default: 'random' },
        seed: { type: Number, default: 0 },
      },
      views: { type: Number, default: 0 },
    },
    { timestamps: true },
  ),

  // AI 资源台的「板块」（顶部那排：中转站 / 工具 / Skills / …，后台可新增、改名、排序、删除）。
  // key 是稳定标识：内置板块的 key 同时也是 URL 里的集合名（stations / tools / …）；
  // builtin=true 的板块数据仍存在各自独立的集合里，不能删除。
  HubBoard: new Schema(
    {
      key: { type: String, required: true, unique: true, index: true },
      name: { type: String, required: true }, // 展示名（可改名）
      icon: { type: String, default: '' }, // 前端图标键（cloud / code / …）
      sort: { type: Number, default: 0 },
      status: { type: String, default: 'active' }, // active | inactive
      builtin: { type: Boolean, default: false },
    },
    { timestamps: true },
  ),
  // 自定义板块的通用条目（内置板块走各自的模型，不进这里）
  HubItem: new Schema(
    {
      board: { type: String, required: true, index: true }, // 对应 HubBoard.key
      name: { type: String, required: true },
      url: { type: String, default: '' },
      tags: { type: [String], default: [] },
      install: { type: String, default: '' },
      detail: { type: [String], default: [] },
      ...base,
    },
    { timestamps: true },
  ),
};

export function getModel(name) {
  const schema = schemas[name];
  if (!schema) return null;
  // 防止 serverless 热重载重复注册
  return mongoose.models[name] || mongoose.model(name, schema);
}

// 导航分类 / 链接集合名（后台 CRUD 用）
export const NAV_MODELS = ['NavCategory', 'NavLink'];

// 通用 CRUD 开放的集合（GlobalAi 含密钥，只能通过服务端内部读取，不走通用路由）
export const HUB_COLLECTIONS = ['Station', 'Tool', 'Skill', 'Vpn', 'Server', 'Tutorial'];

// URL 里的复数集合名 → 模型名
const COLL_MODEL_MAP = {
  stations: 'Station',
  tools: 'Tool',
  skills: 'Skill',
  vpns: 'Vpn',
  servers: 'Server',
  tutorials: 'Tutorial',
};

export function collToModel(coll) {
  return COLL_MODEL_MAP[coll] || null;
}

// AI 资源台的 6 个内置板块（首次请求 /api/hub/boards 时幂等写入 HubBoard 集合）。
// icon 是前端图标键，映射表见 components/HubTab.vue。
export const BUILTIN_BOARDS = [
  { key: 'stations', name: '中转站', icon: 'cloud', sort: 0 },
  { key: 'tools', name: '工具', icon: 'code', sort: 1 },
  { key: 'skills', name: 'Skills', icon: 'apps', sort: 2 },
  { key: 'vpns', name: 'VPN', icon: 'safe', sort: 3 },
  { key: 'servers', name: 'AI 直连平台', icon: 'thunderbolt', sort: 4 },
  { key: 'tutorials', name: '教程', icon: 'file', sort: 5 },
];

export function isBuiltinBoard(key) {
  return BUILTIN_BOARDS.some((b) => b.key === key);
}
