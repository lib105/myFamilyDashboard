import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import pathModule from 'node:path';
import { capturePriceCards } from './capturePriceCards.js';
import { storePriceEvidence, readPriceEvidence, evidenceRoot } from './priceEvidence.js';
import sites from '../src/data/browserSites.json' with { type: 'json' };
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { normalizeVideoCandidates } from '../src/agents/videoResults.js';
import { readVideoSearchPage } from './videoSearchPage.js';
import { readJDSearchPage } from './jdSearchPage.js';
import { normalizeProducts } from '../src/agents/productResults.js';
import { searchFliggyTravel, fliggySearchHotels, fliggySearchPoi } from './fliggyBridge.js';


// A static import also lets Vite watch server-side whitelist changes during development.
const allowedSites = new Map(sites.filter(s => s.enabled !== false).map(s => [s.id, s]));
const marker = '__FAMILY_EGO_JSON__';
const problem = (status, code, message) => Object.assign(new Error(message), { status, code });
const operations = {
  video: { sites: ['site_bilibili', 'site_douyin', 'site_bing_video'], reader: readVideoSearchPage, noun: '视频', emptyCode: 'NO_VIDEO_RESULTS' },
  products: { sites: ['site_jd'], reader: readJDSearchPage, noun: '商品', emptyCode: 'NO_PRODUCT_RESULTS' },
};

/** Server-owned URLs and fixed scripts only. Client graph data is NOT a security boundary. */
export function validateSearchRequest(input, kind = 'video') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw problem(400, 'INVALID_REQUEST', '请求必须是 JSON 对象');
  if (Object.keys(input).some(k => !['siteId', 'query'].includes(k))) {
    throw problem(400, 'INVALID_REQUEST', '只允许 siteId 与 query；不可提交 URL 或脚本');
  }
  const site = allowedSites.get(input.siteId);
  if (!site) throw problem(403, 'SITE_DENIED', '该站点未在服务器白名单中');
  const operation = operations[kind];
  if (!operation?.sites.includes(site.id)) {
    throw problem(422, 'SITE_UNSUPPORTED', '该站点未获准执行此搜索操作');
  }
  if (typeof input.query !== 'string' || !input.query.trim() || input.query.trim().length > 200) {
    throw problem(400, 'INVALID_QUERY', '搜索关键词须为 1–200 个字符');
  }
  const query = input.query.trim();
  const searchUrl = site.searchUrlTemplate.replace('{query}', encodeURIComponent(query));
  return { siteId: site.id, query, searchUrl };
}

// Input is data, never shell-interpolated code; no shell is used to spawn the CLI.
export function buildBrowserScript({ searchUrl, siteId, taskName, kind = 'video', evidenceDirectory }) {
  const operation = operations[kind];
  if (!operation || !operation.sites.includes(siteId)) throw problem(422, 'OPERATION_DENIED', '不支持的浏览器操作或站点');
  const reader = operation.reader.toString();
  return `
const task = await taskSpace(${JSON.stringify(taskName)});
console.log("Browser task space: " + task.spaceId);
const page = task.page("p1");
await page.goto(${JSON.stringify(searchUrl)}, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction((siteId) => {
    const state = (${reader})(siteId);
    return state.items.length > 0 || Boolean(state.blocker);
  }, ${JSON.stringify(siteId)}, { timeout: 15000 });
} catch (error) {
  if (!/timeout|timed out/i.test(error.message)) throw error;
}
const state = await page.evaluate(${reader}, ${JSON.stringify(siteId)});
const observedAt = new Date().toISOString();
if (state.blocker || !state.items.length) {
  const message = state.blocker === 'verification_required' ? '网站要求安全验证，请手动处理'
    : state.blocker === 'login_required' ? '网站要求登录后搜索，请手动登录'
    : ${JSON.stringify(`未提取到${operation.noun}，可能需要登录、验证或更新站点规则`)};
  await task.handOff();
  console.log(${JSON.stringify(marker)} + JSON.stringify({
    code: state.blocker ? 'BROWSER_NEEDS_ATTENTION' : ${JSON.stringify(operation.emptyCode)},
    error: message + '（浏览器任务空间 ' + task.spaceId + '）'
  }));
} else {
  const captures = ${kind === 'products' && evidenceDirectory ? `await (${capturePriceCards.toString()})(page, state.items, ${JSON.stringify(evidenceDirectory)}, ${reader})` : '[]'};
  await task.finish({ keep: [] });
  console.log(${JSON.stringify(marker)} + JSON.stringify({ siteId: ${JSON.stringify(siteId)}, items: state.items, observedAt, captures }));
}
`;
}

function execCli(args, { timeout = 35000, cliPath = process.env.EGO_BROWSER_BIN || 'ego-browser' } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(cliPath, args, { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        if (error.code === 'ENOENT') return reject(problem(503, 'CLI_NOT_FOUND', '服务进程找不到 ego-browser，请设置 EGO_BROWSER_BIN 为绝对路径'));
        if (error.killed) return reject(problem(504, 'BROWSER_TIMEOUT', '浏览器执行超时，请检查 ego-lite 运行状态及站点登录/验证码'));
        return reject(problem(502, 'BROWSER_FAILED', 'ego-browser 执行失败，请在服务器同一账号下检查 ego-lite 是否启动并完成初始化'));
      }
      // ego-browser forwards sandbox console output to stderr on some versions.
      // Both streams are untrusted; callers only parse our exact structured marker.
      resolve(`${stdout}\n${stderr}`);
    });
    // The CLI also supports scripts on stdin. Without EOF it may wait indefinitely
    // even with `-e`; a service process has no interactive terminal to close stdin.
    child.stdin.end();
  });
}

async function executeBrowserSearch(request, options = {}, kind = 'video') {
  const directory = kind === 'products' ? await mkdtemp(pathModule.join(tmpdir(), 'family-price-capture-')) : null;
  try {
    const script = buildBrowserScript({ ...request, kind, evidenceDirectory: directory, taskName: options.taskName || `family-${kind}-${randomUUID()}` });
    const stdout = await execCli(['nodejs', '-e', script], { timeout: kind === 'products' ? 65000 : 35000, ...options });
    const line = stdout.split('\n').find(l => l.startsWith(marker));
    let parsed;
    try { parsed = JSON.parse(line?.slice(marker.length)); } catch {
      throw problem(502, 'INVALID_BROWSER_OUTPUT', '浏览器未返回有效的结构化结果');
    }
    if (parsed?.error) throw problem(parsed.code === 'BROWSER_NEEDS_ATTENTION' ? 409 : 502, parsed.code || 'BROWSER_FAILED', parsed.error);
    if (kind === 'products') {
      for (const item of Array.isArray(parsed.items) ? parsed.items : []) { if (item && typeof item === 'object') delete item.evidence; }
      for (const capture of (Array.isArray(parsed.captures) ? parsed.captures : []).slice(0, 10)) {
        if (!Number.isInteger(capture.slot) || capture.slot < 0 || capture.slot >= 10) continue;
        const raw = parsed.items?.[capture.slot];
        const product = normalizeProducts([raw], request.siteId)[0];
        if (!product || product.sku !== capture.sku) continue;
        try {
          const filename = pathModule.join(directory, `${capture.slot}.png`);
          if (!(await lstat(filename)).isFile()) continue;
          raw.evidence = await storePriceEvidence(await readFile(filename), product, {
            sourceUrl: request.searchUrl, observedAt: capture.observedAt, root: options.evidenceRoot || evidenceRoot,
          });
        } catch { /* Capture/persistence failure stays missing; never synthesize an image. */ }
      }
    }
    return parsed;
  } finally { if (directory) await rm(directory, { recursive: true, force: true }); }
}

export async function searchWithEgo(request, options = {}) {
  const parsed = await executeBrowserSearch(request, options, 'video');
  const candidates = normalizeVideoCandidates(parsed?.items, request.siteId);
  if (!candidates.length) throw problem(502, 'NO_VIDEO_RESULTS', '未提取到真实视频链接；可能需要登录、处理验证码或更新站点提取规则');
  return {
    bestTitle: candidates[0].title, bestUrl: candidates[0].url, candidates,
    engine: 'ego-browser-live', ranking: 'site-search-order', searchUrl: request.searchUrl,
  };
}

export async function searchProductsWithEgo(request, options = {}) {
  const parsed = await executeBrowserSearch(request, options, 'products');
  const products = normalizeProducts(parsed?.items, request.siteId);
  if (!products.length) throw problem(502, 'NO_PRODUCT_RESULTS', '未提取到有效商品；请检查登录、验证或页面结构');
  return {
    products, engine: 'ego-browser-live', searchUrl: request.searchUrl,
    observedAt: parsed.observedAt || new Date().toISOString(),
    ranking: 'site-search-order',
  };
}

export async function probeEgo(options) {
  const stdout = await execCli(['nodejs', '-e', 'console.log("FAMILY_EGO_READY")'], { ...options, timeout: 10000 });
  if (!stdout.includes('FAMILY_EGO_READY')) throw problem(503, 'BROWSER_NOT_READY', 'ego-browser 运行时未就绪');
  return { bridge: 'ok', runtime: 'ready' };
}

function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    throw problem(415, 'CONTENT_TYPE', '需要 application/json');
  }
  let raw = '';
  let size = 0;
  // Drain oversized bodies without retaining them; throwing inside the async iterator
  // destroys IncomingMessage and would prevent sending the useful 413 response.
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 4096) raw += chunk;
  }
  if (size > 4096) throw problem(413, 'BODY_TOO_LARGE', '请求过大');
  try { return JSON.parse(raw); } catch { throw problem(400, 'INVALID_JSON', 'JSON 格式错误'); }
}

/** Shared by Vite (local dev) and standalone Node (production, behind authenticated proxy). */
export function createEgoHandler({ token = '', search = searchWithEgo, searchProducts = searchProductsWithEgo, probe = probeEgo, evidenceDirectory = evidenceRoot } = {}) {
  let busy = false;
  return async (req, res, next = () => send(res, 404, { error: 'Not found' })) => {
    const path = req.url?.split('?')[0];
    const isEvidence = path?.startsWith('/api/price-evidence/');
    if (!isEvidence && !['/api/ego-browser/health', '/api/ego-browser/search-video', '/api/ego-browser/search-products', '/api/supermarket/search', '/api/fliggy/search', '/api/fliggy/hotels', '/api/fliggy/poi'].includes(path)) return next();
    // Reject cross-site browser requests. Production must ALSO authenticate at the proxy.
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`
      && req.headers.origin !== `https://${req.headers.host}`) {
      return send(res, 403, { error: '不允许跨站请求', code: 'ORIGIN_DENIED' });
    }
    if (token) {
      const supplied = Buffer.from(String(req.headers['x-ego-bridge-token'] || ''));
      const expected = Buffer.from(token);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return send(res, 401, { error: '浏览器接口未授权', code: 'UNAUTHORIZED' });
      }
    }
    const method = path.endsWith('/health') || isEvidence ? 'GET' : 'POST';
    if (req.method !== method) return send(res, 405, { error: `需要 ${method}`, code: 'METHOD_NOT_ALLOWED' });
    try {
      if (isEvidence) {
        if (req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: '不允许跨站访问截图' });
        const match = path.match(/^\/api\/price-evidence\/([0-9a-f-]+)\.png$/);
        try {
          if (!match) throw new Error('Invalid path');
          const bytes = await readPriceEvidence(match[1], evidenceDirectory);
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
          return res.end(bytes);
        } catch { return send(res, 404, { error: '来源截图不存在、已移除或完整性校验失败', code: 'EVIDENCE_NOT_FOUND' }); }
      }
      if (method === 'GET') return send(res, 200, await probe());
      if (path === '/api/fliggy/search') {
        const body = await readJson(req);
        const query = typeof body.query === 'string' ? body.query.trim() : '';
        if (!query) return send(res, 400, { error: '请输入搜索关键词', code: 'INVALID_QUERY' });
        return send(res, 200, await searchFliggyTravel({ ...body, query }));
      }
      if (path === '/api/fliggy/hotels') {
        const body = await readJson(req);
        const items = await fliggySearchHotels(body);
        return send(res, 200, { items });
      }
      if (path === '/api/fliggy/poi') {
        const body = await readJson(req);
        const items = await fliggySearchPoi(body);
        return send(res, 200, { items });
      }
      if (path === '/api/supermarket/search') {
        await readJson(req);
        // Legacy cache contains fabricated/misattributed prices. Never certify it with a screenshot.
        return send(res, 503, { code: 'SUPERMARKET_SOURCE_UNVERIFIED',
          error: '三家商超的真实门店报价通道尚未核验，旧缓存不能作为实时比价。不会将京东代购或不同商品的价格冒充三家超市报价；当前无法提供商超价格来源截图。' });
      }
      const isProducts = path.endsWith('/search-products');
      const request = validateSearchRequest(await readJson(req), isProducts ? 'products' : 'video');
      if (busy) throw problem(429, 'BROWSER_BUSY', '浏览器正在执行另一个任务，请稍后重试');
      busy = true;
      try { send(res, 200, await (isProducts ? searchProducts : search)(request)); } finally { busy = false; }
    } catch (error) {
      send(res, error.status || 502, { error: error.message, code: error.code || 'BRIDGE_ERROR' });
    }
  };
}
