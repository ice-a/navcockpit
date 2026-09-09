// 琛ㄥ崟鍐呭嵆鏃舵帰娴嬫ā鍨嬪垪琛細POST /api/hub/stations/probe
// body: { baseURL, apiKey } 鈥斺€?淇濆瓨鍓嶅厛楠岃瘉 Key 鏄惁鍙敤锛堥渶绠＄悊瀵嗙爜锛?import { readBody } from 'h3';
import { requireAdmin } from '../../../utils/auth';
import { fetchModels } from '../../../utils/stations';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = await readBody(event);
  const models = await fetchModels(body.baseURL, body.apiKey || '');
  return { models };
});
