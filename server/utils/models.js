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
};

export function getModel(name) {
  const schema = schemas[name];
  if (!schema) return null;
  // 防止 serverless 热重载重复注册
  return mongoose.models[name] || mongoose.model(name, schema);
}

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
