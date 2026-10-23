import { createServer } from 'node:http';
import process from 'node:process';
import { createEgoHandler } from './egoBridge.js';

const token = process.env.EGO_BRIDGE_TOKEN;
if (!token) throw new Error('生产接口必须配置 EGO_BRIDGE_TOKEN；通过已认证的反向代理注入该密钥，不能放入前端代码。');
const port = Number(process.env.EGO_BRIDGE_PORT || 3001);
const server = createServer({ requestTimeout: 10000, headersTimeout: 10000 }, createEgoHandler({ token }));
server.listen(port, '127.0.0.1', () => {
  console.log(`ego-browser bridge: http://127.0.0.1:${port} (requires authenticated reverse proxy)`);
});
