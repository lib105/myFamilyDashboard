import assert from 'node:assert/strict';
import { test, before, after, afterEach } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KnowledgeGraph } from '../src/ontology/graph.js';
import { jdProductUrl, normalizeJDProducts } from '../src/agents/productResults.js';
import { getBrowserTaskRuns } from '../src/agents/browserAgent.js';
import { searchProductsWithBrowser } from '../src/agents/shoppingBrowserAgent.js';
import { readJDSearchPage } from '../server/jdSearchPage.js';
import { createEgoHandler, validateSearchRequest, buildBrowserScript } from '../server/egoBridge.js';

const sample = {
  title: '测试用牛奶250ml×24盒', url: 'https://item.jd.com/100005822120.html',
  priceText: '¥62.9', priceNote: 'PLUS到手价', referencePriceText: '¥74.9',
  shop: '测试店铺', promotions: ['券满99享8.5折', '满100减16.1'], badges: ['自营'], isAd: true,
};
const snapshot = { products: [sample], engine: 'ego-browser-live', observedAt: '2026-10-21T09:00:00.000Z' };
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
let vite, seedBase, handleUserMessage;
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
function fixture() {
  const graph = new KnowledgeGraph();
  seedBase(graph);
  graph.addEntity({ id: 'dad', type: 'FamilyMember', name: '爸爸' });
  delete globalThis.window;
  return graph;
}

test('JD URL and snapshot normalization keep observed price conditions, never compute coupon stacking', () => {
  assert.equal(jdProductUrl(sample.url + '?tracking=x'), sample.url);
  for (const url of ['http://item.jd.com/123.html', 'https://item.jd.com.evil.test/123.html',
    'https://search.jd.com/Search?keyword=x', 'javascript:alert(1)', 'https://user:pass@item.jd.com/123.html',
    'https://item.jd.com:444/123.html', 'https://item.jd.com/not-an-id.html']) assert.equal(jdProductUrl(url), null);
  const normalized = normalizeJDProducts([sample, sample, { title: 'fake', url: 'https://evil.test/1.html' }]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].sku, '100005822120');
  assert.equal(normalized[0].priceText, '¥62.9');
  assert.equal(normalized[0].priceNote, 'PLUS到手价');
  assert.deepEqual(normalized[0].promotions, sample.promotions);
  assert.equal(normalized[0].finalPrice, undefined);
  assert.equal(normalized[0].discountPercent, undefined);
  const unknown = normalizeJDProducts([{ title: '未展示价格的商品', url: 'https://item.jd.com/123456.html' }])[0];
  assert.equal(unknown.priceText, '');
  assert.deepEqual(unknown.promotions, []);
});

test('JD search URL is server-owned; video and product operation allowlists are separate', () => {
  const request = validateSearchRequest({ siteId: 'site_jd', query: '牛奶 / 250ml 24盒' }, 'products');
  const url = new URL(request.searchUrl);
  assert.equal(url.origin, 'https://search.jd.com');
  assert.equal(url.pathname, '/Search');
  assert.equal(url.searchParams.get('keyword'), '牛奶 / 250ml 24盒');
  assert.throws(() => validateSearchRequest({ siteId: 'site_jd', query: '牛奶' }), { code: 'SITE_UNSUPPORTED' });
  assert.throws(() => validateSearchRequest({ siteId: 'site_bilibili', query: '牛奶' }, 'products'), { code: 'SITE_UNSUPPORTED' });
  assert.throws(() => validateSearchRequest({ siteId: 'site_jd', query: '牛奶', searchUrl: 'http://127.0.0.1' }, 'products'), { code: 'INVALID_REQUEST' });
  const script = buildBrowserScript({ ...request, taskName: 'jd-unit', kind: 'products' });
  assert.match(script, /waitUntil: 'domcontentloaded'/);
  assert.match(script, /data-sku/);
  assert.match(script, /observedAt/);
  assert.ok(!/page\.(click|fill|press|fetch)\(/.test(script), 'JD job must remain read-only');
});

// Minimal DOM fixtures based on the actual JD data-sku search card inspected in-browser.
const rect = (top = 0, height = 20) => ({ left: 0, right: 200, top, bottom: top + height, width: 200, height });
function element(text, bounds = rect()) {
  return { innerText: text, textContent: text, getBoundingClientRect: () => bounds,
    parentElement: null, querySelector: () => null };
}
test('JD DOM reader separates primary price, PLUS qualifier and only visible promotions', () => {
  const saved = { document: globalThis.document, location: globalThis.location, getComputedStyle: globalThis.getComputedStyle };
  const body = { innerText: '你好，请登录\n牛奶 商品搜索' };
  const title = element(sample.title), price = element('¥ 62 . 9'), note = element('PLUS到手价');
  const compare = element('¥74.9');
  price.parentElement = { querySelector: () => compare, parentElement: body, getBoundingClientRect: () => rect() };
  const tags = element('', rect(0, 20));
  tags.parentElement = body;
  const visibleCoupon = element('券满99享8.5折', rect(0, 20)); visibleCoupon.parentElement = tags;
  const clippedCoupon = element('隐藏优惠', rect(30, 20)); clippedCoupon.parentElement = tags;
  const shop = element('测试店铺');
  const card = {
    innerText: '广告\n' + sample.title,
    getAttribute: name => name === 'data-sku' ? '100005822120' : null,
    getBoundingClientRect: () => rect(0, 300), parentElement: body,
    querySelector: selector => selector.includes('_goods_title_container_') ? title
      : selector.includes('_price_') ? price : selector.includes('_subsidy_') ? note : shop,
    querySelectorAll: selector => selector === 'img[alt]' ? [] : [visibleCoupon, clippedCoupon],
  };
  globalThis.document = { body, querySelectorAll: () => [card] };
  globalThis.location = { hostname: 'search.jd.com' };
  globalThis.getComputedStyle = node => ({ display: 'block', visibility: 'visible', opacity: '1', overflowX: 'visible', overflowY: node === tags ? 'hidden' : 'visible' });
  try {
    const result = readJDSearchPage();
    assert.equal(result.blocker, null, 'ordinary header login link is not a blocking login screen');
    assert.equal(result.items[0].priceText, '¥62.9');
    assert.equal(result.items[0].priceNote, 'PLUS到手价');
    assert.equal(result.items[0].referencePriceText, '¥74.9');
    assert.deepEqual(result.items[0].promotions, ['券满99享8.5折']);
    assert.equal(result.items[0].isAd, true);
    globalThis.location.hostname = 'passport.jd.com';
    assert.deepEqual(readJDSearchPage(), { items: [], blocker: 'login_required' });
    globalThis.location.hostname = 'verify.jd.com';
    assert.deepEqual(readJDSearchPage(), { items: [], blocker: 'verification_required' });
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete globalThis[key];
      else globalThis[key] = saved[key];
    }
  }
});

test('explicit fast-search consent routes JD requests with or without AI; no orders or profile changes', async () => {
  for (const aiEnabled of [false, true]) {
    const graph = fixture();
    if (aiEnabled) globalThis.window = { localStorage: { getItem: () => null }, sessionStorage: { getItem: () => 'test-key' } };
    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push(url);
      assert.equal(url, '/api/ego-browser/search-products');
      const body = JSON.parse(options.body);
      assert.equal(body.siteId, 'site_jd');
      assert.ok(!body.searchUrl);
      return { ok: true, json: async () => snapshot };
    };
    const conditionCount = graph.objects('dad', 'hasCondition').length;
    for (const [text, query] of [
      ['在京东搜索牛奶，看看价格和优惠', '牛奶'],
      ['帮爸爸在京东查血压计的价格', '血压计'],
      ['京东纸尿裤有什么打折信息', '纸尿裤'],
      ['在 JD.com 搜索 纯牛奶250ml24盒 价格', '纯牛奶250ml24盒'],
    ]) {
      const result = await handleUserMessage(`${text}，先直接搜`, { graph });
      assert.equal(result.views[0].type, 'shopping_comparison');
      const run = graph.getEntity(graph.subjects('fulfillsShoppingRequest', result.views[0].args.requestId)[0]);
      assert.ok(run.query.includes(query));
      assert.equal(run.kind, 'product_search');
      assert.equal(run.status, 'succeeded');
      assert.equal(run.observedAt, snapshot.observedAt);
      assert.deepEqual(graph.objects(run.id, 'targetsSite'), ['site_jd']);
      assert.deepEqual(graph.objects(run.id, 'executedByAgent'), ['agent_shopping']);
      assert.match(result.reply, /PLUS到手价/);
      assert.match(result.reply, /券满99享8.5折/);
    }
    assert.deepEqual(requests, Array(4).fill('/api/ego-browser/search-products'));
    assert.equal(graph.findEntities('Order').length, 0);
    assert.equal(graph.objects('dad', 'hasCondition').length, conditionCount);
    assert.equal(getBrowserTaskRuns(graph, { kind: 'video_search' }).length, 0);
    assert.equal(getBrowserTaskRuns(graph, { kind: 'product_search' }).length, 4);
    assert.deepEqual(graph.objects('search_video_with_browser', 'usesBrowserSite').includes('site_jd'), false);
  }
});

test('disabled or ungranted JD capability makes no browser call and does not substitute mock prices', async () => {
  const graph = fixture();
  globalThis.fetch = async () => { assert.fail('browser must not execute'); };
  graph.updateEntity('search_products_with_browser', { enabled: false });
  const disabled = await handleUserMessage('京东牛奶有什么价格和优惠', { graph });
  assert.match(disabled.reply, /禁用|未启用/);
  assert.equal(graph.findEntities('BrowserTaskRun').length, 0);
  const denied = await searchProductsWithBrowser({ query: '牛奶' }, { graph, capability: { id: 'ungranted' } });
  assert.match(denied.reply, /未获准访问/);
  assert.equal(graph.findEntities('BrowserTaskRun').length, 0);
});

test('failed, simulated and invalid product results record failure without falling back to demo prices', async () => {
  for (const response of [
    { ok: false, json: async () => ({ error: '请手动登录京东', code: 'BROWSER_NEEDS_ATTENTION' }) },
    { ok: true, json: async () => ({ ...snapshot, engine: 'simulated' }) },
    { ok: true, json: async () => ({ ...snapshot, products: [{ title: '搜索页', url: 'https://search.jd.com/Search?keyword=x' }] }) },
    { ok: true, json: async () => ({ ...snapshot, observedAt: '' }) },
    { ok: false, status: 404, json: async () => { throw new SyntaxError('HTML'); } },
  ]) {
    const graph = fixture();
    globalThis.fetch = async () => response;
    const result = await handleUserMessage('京东牛奶价格和优惠，先直接搜', { graph });
    const run = graph.getEntity(graph.subjects('fulfillsShoppingRequest', result.views[0].args.requestId)[0]);
    assert.equal(run.status, 'failed');
    assert.deepEqual(run.products, []);
    assert.match(result.reply, /未完成/);
    assert.doesNotMatch(result.reply, /超市比价（模拟数据）/);
    assert.equal(graph.findEntities('Order').length, 0);
  }
});

test('JD product endpoint shares auth, site checks and browser concurrency limits with video search', async () => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const handler = createEgoHandler({ token: 'test-only', search: async () => ({ ok: true }), searchProducts: async () => {
    entered();
    await new Promise(resolve => { release = resolve; });
    return snapshot;
  } });
  const http = createHttpServer(handler);
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const root = `http://127.0.0.1:${http.address().port}`;
  const post = (path, body, token = 'test-only') => originalFetch(root + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ego-bridge-token': token }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await post('/api/ego-browser/search-products', { siteId: 'site_jd', query: 'x' }, '')).status, 401);
    assert.equal((await post('/api/ego-browser/search-products', { siteId: 'site_bilibili', query: 'x' })).status, 422);
    const pending = post('/api/ego-browser/search-products', { siteId: 'site_jd', query: '牛奶' });
    await started;
    try { assert.equal((await post('/api/ego-browser/search-video', { siteId: 'site_bilibili', query: 'x' })).status, 429); }
    finally { release(); }
    assert.equal((await pending).status, 200);
  } finally { http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); }
});

test('product card renders price qualifiers, missing values, observation time and safe product links', async () => {
  const { default: ProductSearchView } = await vite.ssrLoadModule('/src/components/home/ProductSearchView.jsx');
  const { default: ViewCard } = await vite.ssrLoadModule('/src/components/home/ViewCard.jsx');
  const { graph } = await vite.ssrLoadModule('/src/ontology/index.js');
  graph.addEntity({ id: 'jd-render-test', type: 'BrowserTaskRun', kind: 'product_search', status: 'succeeded',
    query: '牛奶', products: [sample, { title: '未知价格商品', url: 'https://item.jd.com/123456.html' }], observedAt: snapshot.observedAt });
  const markup = renderToStaticMarkup(createElement(ProductSearchView, { args: { runId: 'jd-render-test' } }));
  assert.match(markup, /PLUS到手价/);
  assert.match(markup, /券满99享8.5折/);
  assert.match(markup, /价格未取得/);
  assert.match(markup, /页面对照价/);
  assert.match(markup, /采集于/);
  assert.match(markup, /不是无条件|不是.*结算价|未自动叠加优惠或计算结算价/);
  assert.match(markup, /https:\/\/item.jd.com\/100005822120.html/);
  // The new view type is wired into the card registry, not just implemented in isolation.
  assert.match(renderToStaticMarkup(createElement(ViewCard, { view: { type: 'product_search', title: '京东测试', args: { runId: 'jd-render-test' } } })), /京东商品搜索结果/);
});
