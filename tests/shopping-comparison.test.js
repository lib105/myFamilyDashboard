import assert from 'node:assert/strict';
import { before, after, afterEach, test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KnowledgeGraph } from '../src/ontology/graph.js';
import { normalizeProducts, taobaoProductUrl } from '../src/agents/productResults.js';
import { evaluateProduct, observedPrice, storeEvidence } from '../src/agents/productComparison.js';
import { searchProductsWithBrowser } from '../src/agents/shoppingBrowserAgent.js';
import { parseBudget, milkPack } from '../src/agents/shoppingRequirements.js';
import { validateSearchRequest, buildBrowserScript, createEgoHandler } from '../server/egoBridge.js';

let vite, seedBase, handleUserMessage;
const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  ({ seedBase } = await vite.ssrLoadModule('/src/ontology/seed.js'));
  ({ handleUserMessage } = await vite.ssrLoadModule('/src/agents/orchestrator.js'));
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});
after(async () => { await vite?.close(); });
const fixture = () => { const graph = new KnowledgeGraph(); seedBase(graph); delete globalThis.window; return graph; };
const rawJD = { title: '伊利金典常温纯牛奶250ml×24盒', url: 'https://item.jd.com/123456.html', priceText: '¥100.00', shop: '伊利店', badges: ['自营'] };
const rawTB = { title: '历史淘宝商品', url: 'https://detail.tmall.com/item.htm?id=987654&skuId=123123', priceText: '¥95.00', shop: '历史旗舰店' };
const jd = normalizeProducts([rawJD], 'site_jd')[0];
const requirements = { category: 'milk', brand: '伊利', variant: '常温牛奶', spec: '250ml×24盒', minPrice: null, maxPrice: 200 };
function mockBrowser() {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/ego-browser/search-products');
    const body = JSON.parse(options.body); requests.push(body);
    assert.equal(body.siteId, 'site_jd', 'no Taobao/Tmall request may execute');
    return { ok: true, json: async () => ({ engine: 'ego-browser-live', products: [rawJD], observedAt: '2026-10-21T09:00:00.000Z' }) };
  };
  return requests;
}

test('milk clarification still collects type, brand, pack and budget before searching JD only', async () => {
  const graph = fixture(), requests = mockBrowser();
  globalThis.window = { localStorage: { getItem: () => null }, sessionStorage: { getItem: () => 'test-key' } };
  let result = await handleUserMessage('我想买牛奶', { graph });
  assert.equal(result.followUp.field, 'variant');
  assert.equal(requests.length, 0);
  const id = result.shoppingRequestId;
  result = await handleUserMessage('常温牛奶', { graph, shoppingRequestId: id });
  assert.equal(result.followUp.field, 'brand');
  result = await handleUserMessage('伊利', { graph, shoppingRequestId: id });
  assert.equal(result.followUp.field, 'spec');
  result = await handleUserMessage('250ml×24盒', { graph, shoppingRequestId: id });
  assert.equal(result.followUp.field, 'budget');
  assert.equal(requests.length, 0);
  result = await handleUserMessage('100-200元', { graph, shoppingRequestId: id });
  assert.equal(result.views[0].type, 'shopping_comparison');
  assert.equal(result.shoppingRequestId, null);
  assert.deepEqual(requests.map(r => r.siteId), ['site_jd']);
  assert.equal(graph.getEntity(id).status, 'completed');
  assert.equal(graph.getEntity(id).minPrice, 100);
  assert.equal(graph.getEntity(id).maxPrice, 200);
  assert.equal(graph.subjects('fulfillsShoppingRequest', id).length, 1);
  assert.equal(graph.findEntities('Order').length, 0);
});

test('bicycle questions preserve type, brand and budget with no invented model or size', async () => {
  const graph = fixture(), requests = mockBrowser();
  let result = await handleUserMessage('在京东找自行车', { graph });
  const id = result.shoppingRequestId;
  result = await handleUserMessage('公路车', { graph, shoppingRequestId: id });
  assert.equal(result.followUp.field, 'brand');
  result = await handleUserMessage('迪卡侬', { graph, shoppingRequestId: id });
  assert.equal(result.followUp.field, 'spec');
  result = await handleUserMessage('型号/尺码不限', { graph, shoppingRequestId: id });
  assert.equal(result.followUp.field, 'budget');
  assert.equal(requests.length, 0);
  result = await handleUserMessage('3000-6000元', { graph, shoppingRequestId: id });
  assert.equal(result.views[0].type, 'shopping_comparison');
  assert.equal(graph.getEntity(id).variant, '公路车');
  assert.equal(graph.getEntity(id).brand, '迪卡侬');
  assert.equal(graph.getEntity(id).spec, '不限');
  assert.deepEqual(requests.map(r => r.siteId), ['site_jd']);
});

test('explicit skip, cancel and unrelated commands retain their existing behavior', async () => {
  const graph = fixture(), requests = mockBrowser();
  const first = await handleUserMessage('我想买牛奶', { graph });
  const id = first.shoppingRequestId;
  await handleUserMessage('冷藏鲜奶', { graph, shoppingRequestId: id });
  const weather = await handleUserMessage('今天天气怎么样', { graph, shoppingRequestId: id });
  assert.equal(weather.views[0].type, 'weather');
  assert.equal(graph.getEntity(id).brand, null);
  const fast = await handleUserMessage('先直接搜', { graph, shoppingRequestId: id });
  assert.equal(fast.views[0].type, 'shopping_comparison');
  assert.equal(graph.getEntity(id).brand, '不限');
  assert.ok(requests.every(r => !r.query.includes('先直接搜')));
  const next = await handleUserMessage('我想买自行车', { graph });
  const count = requests.length;
  const cancelled = await handleUserMessage('取消采购', { graph, shoppingRequestId: next.shoppingRequestId });
  assert.equal(cancelled.shoppingRequestId, null);
  assert.equal(graph.getEntity(next.shoppingRequestId).status, 'cancelled');
  assert.equal(requests.length, count);
});

test('full requirements skip questions; negations and out-of-order budget answers do not invent preferences', async () => {
  const graph = fixture(), requests = mockBrowser();
  const detailed = await handleUserMessage('在京东找蒙牛常温牛奶200ml×24盒，预算100以内', { graph });
  assert.equal(detailed.views[0].type, 'shopping_comparison');
  assert.equal(requests.length, 1);
  assert.ok(!requests[0].query.includes('预算'));
  const pending = await handleUserMessage('我想买牛奶', { graph });
  const id = pending.shoppingRequestId;
  const negated = await handleUserMessage('不要常温', { graph, shoppingRequestId: id });
  assert.equal(negated.followUp.field, 'variant');
  assert.equal(graph.getEntity(id).variant, null);
  await handleUserMessage('常温牛奶', { graph, shoppingRequestId: id });
  const budget = await handleUserMessage('预算100以内', { graph, shoppingRequestId: id });
  assert.equal(budget.followUp.field, 'brand');
  assert.equal(graph.getEntity(id).brand, null);
  assert.equal(graph.getEntity(id).maxPrice, 100);
  assert.equal(requests.length, 1);
});

test('Taobao/Tmall-only messages are refused with no LLM, browser or new shopping request', async () => {
  const graph = fixture();
  globalThis.fetch = async () => { assert.fail('disabled platforms must not execute'); };
  globalThis.window = { localStorage: { getItem: () => null }, sessionStorage: { getItem: () => 'test-key' } };
  for (const text of ['淘宝搜索牛奶', '在天猫查自行车', 'taobao milk', 'tmall 牛奶']) {
    const result = await handleUserMessage(text, { graph });
    assert.match(result.reply, /搜索已取消/);
    assert.equal(result.views.length, 0);
  }
  assert.equal(graph.findEntities('ShoppingRequest').length, 0);
  assert.equal(graph.findEntities('BrowserTaskRun').length, 0);
});

test('old dual-platform pending conversations continue on JD; old Taobao-only requests are cancelled, not switched silently', async () => {
  const graph = fixture(), requests = mockBrowser();
  const addLegacy = (id, sites) => graph.addEntity({ id, type: 'ShoppingRequest', keywords: '牛奶', category: 'milk', sites,
    variant: null, brand: null, spec: null, budgetSpecified: false, minPrice: null, maxPrice: null, status: 'collecting' });
  addLegacy('old-both', ['site_jd', 'site_taobao']);
  const followUp = await handleUserMessage('常温牛奶', { graph, shoppingRequestId: 'old-both' });
  assert.equal(followUp.followUp.field, 'brand');
  assert.deepEqual(graph.getEntity('old-both').sites, ['site_jd']);
  assert.match(followUp.reply, /搜索已取消/);
  await handleUserMessage('先直接搜', { graph, shoppingRequestId: 'old-both' });
  assert.deepEqual(requests.map(r => r.siteId), ['site_jd']);
  addLegacy('old-taobao', ['site_taobao']);
  const refused = await handleUserMessage('先直接搜', { graph, shoppingRequestId: 'old-taobao' });
  assert.equal(refused.shoppingRequestId, null);
  assert.equal(graph.getEntity('old-taobao').status, 'cancelled');
  assert.equal(requests.length, 1);
});

test('tampered client grants cannot reactivate disabled platform execution', async () => {
  const graph = fixture();
  graph.addTriple('search_products_with_browser', 'usesBrowserSite', 'site_taobao');
  graph.updateEntity('site_taobao', { enabled: true });
  globalThis.fetch = async () => { assert.fail('client grant must not reactivate Taobao'); };
  const result = await searchProductsWithBrowser({ query: '牛奶', site: 'site_taobao' }, { graph, capability: graph.getEntity('search_products_with_browser') });
  assert.match(result.reply, /搜索已取消/);
  assert.equal(graph.findEntities('BrowserTaskRun').length, 0);
  assert.deepEqual(graph.objects('search_products_with_browser', 'usesBrowserSite').includes('site_jd'), true);
});

test('server and script-builder deny Taobao and Tmall even if called directly', async () => {
  for (const siteId of ['site_taobao', 'site_tmall']) {
    assert.throws(() => validateSearchRequest({ siteId, query: '牛奶' }, 'products'), { code: 'SITE_DENIED' });
    assert.throws(() => buildBrowserScript({ siteId, searchUrl: 'https://s.taobao.com/search?q=x', taskName: 'must-not-execute', kind: 'products' }), { code: 'OPERATION_DENIED' });
  }
  let browserCalls = 0;
  const http = createHttpServer(createEgoHandler({ searchProducts: async () => { browserCalls++; return {}; } }));
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  try {
    const response = await originalFetch(`http://127.0.0.1:${http.address().port}/api/ego-browser/search-products`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId: 'site_taobao', query: '牛奶' }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'SITE_DENIED');
    assert.equal(browserCalls, 0);
  } finally { http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); }
});

test('failure stays a failure, without substituting mock offers or orders', async () => {
  const graph = fixture();
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: '请人工处理京东验证', code: 'BROWSER_NEEDS_ATTENTION' }) });
  const result = await handleUserMessage('我想买牛奶，先直接搜', { graph });
  const id = result.views[0].args.requestId;
  assert.equal(graph.getEntity(id).status, 'failed');
  assert.equal(graph.subjects('fulfillsShoppingRequest', id).length, 1);
  assert.equal(graph.findEntities('Order').length, 0);
});

test('JD storefront and requirement validation preserve model, size, pack and budget checks', () => {
  assert.equal(storeEvidence(jd).basis, 'badge');
  assert.equal(storeEvidence({ ...jd, badges: [], shop: '', title: '官方旗舰店牛奶' }).preferred, false);
  assert.ok(evaluateProduct({ ...jd, title: '伊利金典常温纯牛奶250ml×24盒*2箱' }, requirements).excluded.includes('容量或包装数量不符'));
  const bike = { ...jd, title: '迪卡侬公路车RC500 L码700c' };
  const request = { category: 'bicycle', brand: '迪卡侬', variant: '公路车', spec: 'RC120 M码700c', minPrice: null, maxPrice: null };
  assert.ok(evaluateProduct(bike, request).excluded.includes('指定型号不符'));
  assert.ok(evaluateProduct(bike, request).excluded.includes('指定车架尺码不符'));
  for (const value of ['¥3?', '¥19.9起', '¥19-29', '价格面议', '']) assert.equal(observedPrice({ priceText: value }), null);
});

test('pack and budget parsing still normalizes counts and validates ranges', () => {
  assert.deepEqual(milkPack('1L×12盒'), { volumeMl: 1000, count: 12 });
  assert.deepEqual(milkPack('200ml×24盒*3箱'), { volumeMl: 200, count: 72 });
  assert.deepEqual(milkPack('2箱250ml*18包'), { volumeMl: 250, count: 36 });
  assert.equal(milkPack('200ml×24盒两箱'), null);
  assert.deepEqual(parseBudget('100-200元'), { budgetSpecified: true, minPrice: 100, maxPrice: 200 });
  assert.deepEqual(parseBudget('预算1万以内'), { budgetSpecified: true, minPrice: null, maxPrice: 10000 });
  assert.ok(parseBudget('200-100元').error);
  assert.ok(parseBudget('预算-100元').error);
});

test('historical snapshots are retained, but the current shopping view has no cross-platform table or live Taobao link', async () => {
  const { default: View } = await vite.ssrLoadModule('/src/components/home/ShoppingComparisonView.jsx');
  const { graph } = await vite.ssrLoadModule('/src/ontology/index.js');
  graph.addEntity({ id: 'comparison-render', type: 'ShoppingRequest', ...requirements, sites: ['site_jd', 'site_taobao'] });
  for (const [id, site, products] of [['render-jd', 'site_jd', [rawJD]], ['render-tb', 'site_taobao', [rawTB]]]) {
    graph.addEntity({ id, type: 'BrowserTaskRun', status: 'succeeded', products, observedAt: '2026-10-21T09:00:00Z' });
    graph.addTriple(id, 'targetsSite', site);
    graph.addTriple(id, 'fulfillsShoppingRequest', 'comparison-render');
  }
  const markup = renderToStaticMarkup(createElement(View, { args: { requestId: 'comparison-render' } }));
  assert.match(markup, /采购需求与京东商品/);
  assert.match(markup, /原始快照保留/);
  assert.match(markup, /页面自营标识/);
  assert.ok(!markup.includes('<table'));
  assert.ok(!markup.includes('href="https://detail.tmall.com'));
  assert.equal(graph.getEntity('render-tb').products[0].title, '历史淘宝商品');
  assert.equal(taobaoProductUrl(rawTB.url), rawTB.url, 'pure historical URL normalization does not activate browsing');
});
