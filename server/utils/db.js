// 远程 MongoDB 连接（mongoose），Serverless 冷启动时复用连接。
// 环境变量 MONGODB_URI 在服务端持有，浏览器永远拿不到。
import mongoose from 'mongoose';

let cached = null;

export function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('缺少 MONGODB_URI 环境变量（远程 MongoDB 连接串）');
  }
  if (!cached) {
    // 连接串未写库名时，显式落到 tools 库（mongoose 默认是 test，不符合预期）
    const dbName =
      uri.match(/mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/)?.[1] ||
      process.env.MONGODB_DB_NAME ||
      'tools';
    cached = mongoose.connect(uri, { dbName }).then((m) => m);
  }
  return cached;
}
