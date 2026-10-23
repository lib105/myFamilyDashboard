import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test, before, after } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer as createHttpServer } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { storePriceEvidence, readPriceEvidence } from '../server/priceEvidence.js';
import { normalizeJDProducts } from '../src/agents/productResults.js';
import { capturePriceCards } from '../server/capturePriceCards.js';
import { KnowledgeGraph } from '../src/ontology/graph.js';
import { searchProductsWithBrowser } from '../src/agents/shoppingBrowserAgent.js';
import { createEgoHandler, buildBrowserScript, validateSearchRequest, searchProductsWithEgo } from '../server/egoBridge.js';

// Synthetic PNG belongs only to isolated unit-test storage, never production price evidence.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3z8AAAAASUVORK5CYII=', 'base64');
const product = normalizeJDProducts([{ title: '测试牛奶250ml×24盒', url: 'https://item.jd.com/123456.html', priceText: '¥62.9', priceNote: 'PLUS到手价', shop: '测试店铺', promotions: ['测试优惠条件'] }])[0];
const observedAt = '2026-10-22T09:00:00Z';
const sourceUrl = 'https://search.jd.com/Search?keyword=test';
let root, evidence, vite, Component, ProductResultRow;
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'family-evidence-unit-'));
  evidence = await storePriceEvidence(png, product, { root, observedAt, sourceUrl });
  vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  ({ default: Component } = await vite.ssrLoadModule('/src/components/home/PriceEvidence.jsx'));
  ({ default: ProductResultRow } = await vite.ssrLoadModule('/src/components/home/ProductResultRow.jsx'));
});
after(async () => { await vite?.close(); await rm(root, { recursive: true, force: true }); });

test('immutable capture stores timestamp, exact source product and digest, and survives rereading', async () => {
  assert.equal(evidence.productUrl, product.url); assert.equal(evidence.priceNote, product.priceNote);
  assert.equal(evidence.sourceUrl, sourceUrl); assert.equal(evidence.observedAt, observedAt);
  assert.deepEqual(await readPriceEvidence(evidence.id, root), png);
  assert.equal(JSON.parse(await readFile(join(root, `${evidence.id}.json`), 'utf8')).sha256, evidence.sha256);
  await assert.rejects(readPriceEvidence('../secret', root));
  await assert.rejects(storePriceEvidence(Buffer.from('fake image'), product, { root, sourceUrl, observedAt }));
  const second = await storePriceEvidence(png, product, { root, sourceUrl, observedAt });
  await writeFile(join(root, `${second.id}.png`), 'tampered');
  await assert.rejects(readPriceEvidence(second.id, root));
});

test('normalization retains only bound local screenshots and rejects substituted prices/URLs/products', () => {
  const normalized = normalizeJDProducts([{ ...product, evidence }])[0];
  assert.equal(normalized.evidence.imageUrl, evidence.imageUrl);
  assert.deepEqual(normalizeJDProducts([normalized])[0], normalized, 'graph re-normalization keeps the proof');
  for (const changed of [
    { ...evidence, imageUrl: 'https://evil.test/image.png' }, { ...evidence, productUrl: 'https://item.jd.com/999.html' },
    { ...evidence, priceText: '¥1' }, { ...evidence, sourceUrl: 'javascript:alert(1)' },
    { ...evidence, promotions: [] }, { ...evidence, shop: 'other shop' },
  ]) assert.equal(normalizeJDProducts([{ ...product, evidence: changed }])[0].evidence, null);
});

test('capture binds SKU and price before and after screenshot; failed capture never fabricates evidence', async () => {
  const raw = { ...product };
  let screenshots = 0, reads = 0;
  const page = {
    evaluate: async (_fn, sku) => sku ? { x: 10, y: 20, width: 240, height: 300 } : { items: [reads++ < 1 ? raw : { ...raw, priceText: '¥99' }] },
    screenshot: async options => { screenshots++; assert.equal(options.clip.width, 240); assert.equal(options.fullPage, undefined); },
  };
  assert.deepEqual(await capturePriceCards(page, [raw], '/unit-staging', () => {}), []);
  assert.equal(screenshots, 1);
  page.evaluate = async (_fn, sku) => sku ? { x: 10, y: 20, width: 240, height: 300 } : { items: [raw] };
  const captured = await capturePriceCards(page, [raw], '/unit-staging', () => {});
  assert.equal(captured[0].sku, product.sku); assert.ok(Date.parse(captured[0].observedAt));
  page.screenshot = async () => { throw Error('capture timed out'); };
  assert.deepEqual(await capturePriceCards(page, [raw, raw], '/unit-staging', () => {}), []);
  const script = buildBrowserScript({ ...validateSearchRequest({ siteId: 'site_jd', query: '牛奶' }, 'products'), kind: 'products', taskName: 'unit', evidenceDirectory: '/unit-staging' });
  assert.ok(script.indexOf('page.screenshot') < script.indexOf('await task.finish'));
  assert.match(script, /getBoundingClientRect/); assert.match(script, /data-sku/);
  assert.doesNotMatch(script, /fullPage: true/);
});

test('CLI capture becomes a persisted source image, with no arbitrary filesystem paths from CLI output', async () => {
  const cli = join(root, 'fake-cli');
  const payload = { items: [product], captures: [{ slot: 0, sku: product.sku, observedAt }], observedAt };
  await writeFile(cli, `#!/usr/bin/env node\nconst fs=require('fs'); const script=process.argv[4];\nconst match=script.match(/\\(page, state\\.items, ("[^"]+"),/); const dir=JSON.parse(match[1]);\nfs.writeFileSync(dir+'/0.png', Buffer.from(${JSON.stringify(png.toString('base64'))},'base64'));\nconsole.log('__FAMILY_EGO_JSON__'+${JSON.stringify(JSON.stringify(payload))});\n`, { mode: 0o700 });
  const result = await searchProductsWithEgo(validateSearchRequest({ siteId: 'site_jd', query: '牛奶' }, 'products'), { cliPath: cli, evidenceRoot: root });
  assert.ok(result.products[0].evidence);
  assert.deepEqual(await readPriceEvidence(result.products[0].evidence.id, root), png);
});

test('image GET uses same API authorization, denies traversal and cross-site embedding', async () => {
  const handler = createEgoHandler({ token: 'unit-only', evidenceDirectory: root });
  const http = createHttpServer(handler);
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${http.address().port}`;
  try {
    assert.equal((await fetch(base + evidence.imageUrl)).status, 401);
    const headers = { 'x-ego-bridge-token': 'unit-only' };
    const image = await fetch(base + evidence.imageUrl, { headers });
    assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
    assert.match(image.headers.get('cache-control'), /private/);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    assert.equal((await fetch(base + '/api/price-evidence/%2e%2e%2fsecret.png', { headers })).status, 404);
    assert.equal((await fetch(base + evidence.imageUrl, { headers: { ...headers, 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(base + '/api/supermarket/search', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{"keyword":"苹果"}' })).status, 503);
  } finally { http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); }
});

test('procurement run keeps screenshot provenance alongside the product snapshot for later views', async () => {
  const graph = new KnowledgeGraph();
  graph.addEntity({ id: 'site_jd', type: 'BrowserSite', label: '京东', searchUrlTemplate: 'https://search.jd.com/Search?keyword={query}' });
  const capability = graph.addEntity({ id: 'search_products_with_browser', type: 'Capability' });
  graph.addTriple(capability.id, 'usesBrowserSite', 'site_jd');
  graph.addEntity({ id: 'request', type: 'ShoppingRequest', status: 'ready', sites: ['site_jd'], keywords: '牛奶', category: 'generic', brand: '不限', spec: '不限', budgetSpecified: true });
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ engine: 'ego-browser-live', observedAt, products: [{ ...product, evidence }] }) });
  try {
    await searchProductsWithBrowser({ requestId: 'request' }, { graph, capability });
    const run = graph.findEntities('BrowserTaskRun')[0];
    assert.equal(run.products[0].evidence.id, evidence.id);
    const normalized = normalizeJDProducts(run.products)[0];
    assert.equal(normalized.evidence.observedAt, observedAt);
    const html = renderToStaticMarkup(createElement(Component, { product: normalized }));
    assert.ok(html.includes(evidence.imageUrl));
  } finally { globalThis.fetch = original; }
});

test('thumbnail is an accessible dialog trigger; missing/unsafe evidence is not a fake product picture', () => {
  const html = renderToStaticMarkup(createElement(Component, { product: { ...product, evidence } }));
  assert.match(html, /aria-haspopup="dialog"/); assert.match(html, /<dialog/); assert.match(html, /关闭截图/);
  assert.match(html, /width="32" height="32"/);
  assert.match(html, /title="点击放大价格来源截图/);
  assert.doesNotMatch(html, /width="160"|height="120"|class="price-evidence mt-sm"/);
  assert.ok(html.includes(evidence.imageUrl)); assert.ok(html.includes('PLUS到手价'));
  const absent = renderToStaticMarkup(createElement(Component, { product }));
  assert.match(absent, /未留存价格来源截图/); assert.doesNotMatch(absent, /<img/);
});

test('compact procurement row keeps full offers and requirement warnings alongside icon-sized proof', () => {
  const html = renderToStaticMarkup(createElement(ProductResultRow, {
    product: { ...product, evidence, referencePriceText: '¥79.00' },
    assessment: { store: { label: '页面自营标识' }, excluded: ['包装规格不符'], issues: ['类型未核实'] },
  }));
  assert.match(html, /class="jd-product"/);
  assert.doesNotMatch(html, /produce-card|mini-chip/);
  for (const value of [product.title, product.priceText, product.priceNote, product.shop, product.promotions[0],
    '页面对照价：', '¥79.00', '需求不符：包装规格不符', '待核实：类型未核实', '页面自营标识']) {
    assert.ok(html.includes(value), `compact row retains ${value}`);
  }
  assert.ok(html.indexOf('price-evidence') < html.indexOf('jd-product-info'), 'proof has a fixed leading slot');
  assert.match(html, /width="32" height="32"/);
});
