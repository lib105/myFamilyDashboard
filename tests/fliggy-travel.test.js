import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { KnowledgeGraph } from '../src/ontology/graph.js';
import { resolveFliggyRequest } from '../src/agents/fliggyRequest.js';
import { searchFliggyTravel, normalizeFliggyItems } from '../server/fliggyBridge.js';

let server, seedBase, handleUserMessage;
const originalFetch = globalThis.fetch;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  ({ seedBase } = await server.ssrLoadModule('/src/ontology/seed.js'));
  ({ handleUserMessage } = await server.ssrLoadModule('/src/agents/orchestrator.js'));
});
after(async () => { globalThis.fetch = originalFetch; await server?.close(); });
const now = new Date('2026-10-22T16:30:00Z'); // Already Oct 23 in China.
const url = 'https://router.feizhu.com/ws/test';
const fixture = (type) => {
  if (type === 'hotel') return { shId: 'h1', name: '杭州酒店', price: 500, detailUrl: url };
  if (type === 'poi') return { id: 'p1', name: '上海迪士尼', ticketInfo: { ticketName: '成人票', price: '¥399' }, jumpUrl: url };
  return { journeys: [{ segments: [{ marketingTransportNo: type === 'train' ? 'G1' : 'MU1234', marketingTransportName: '交通', transportType: type === 'train' ? '火车' : '飞机', depStationName: '北京', arrStationName: '上海', depDateTime: '2026-10-24 10:00', arrDateTime: '2026-10-24 12:00', seatClassName: '座席' }] }], price: '498', ticketPrice: '700', jumpUrl: url };
};

test('intent and dates use China calendar, missing transport fields ask instead of hotel fallback', () => {
  assert.deepEqual(resolveFliggyRequest({ query: '飞猪查明天北京到上海的航班' }, now), { type: 'flight', query: '飞猪查明天北京到上海的航班', origin: '北京', destination: '上海', depDate: '2026-10-24' });
  for (const query of ['飞猪查机票', '飞猪北京到上海的机票', '飞猪明天到上海机票']) assert.match(resolveFliggyRequest({ query }, now).error, /出发地.*目的地.*日期/);
  assert.match(resolveFliggyRequest({ query: '飞猪酒店和门票' }, now).error, /多个旅行品类/);
  assert.match(resolveFliggyRequest({ query: '飞猪查景点门票' }, now).error, /城市/);
});

test('server selects distinct official tools and never calls fast search for specific categories', async () => {
  for (const [type, query, command, expected] of [
    ['flight', '飞猪查明天北京到上海的航班', 'search-flight', ['--origin', '北京', '--destination', '上海', '--dep-date', '2026-10-24']],
    ['train', '飞猪查明天北京到上海的高铁', 'search-train', ['--origin', '北京', '--destination', '上海', '--dep-date', '2026-10-24']],
    ['poi', '飞猪上海迪士尼门票', 'search-poi', ['--city-name', '上海', '--keyword', '迪士尼']],
    ['hotel', '飞猪杭州西湖酒店', 'search-hotel', ['--dest-name', '杭州', '--key-words', '杭州西湖酒店']],
  ]) {
    let count = 0;
    const result = await searchFliggyTravel({ query, type: 'all' }, { now, run: async (cmd, args) => {
      count++; assert.equal(cmd, command); assert.deepEqual(args, expected);
      return { status: 0, data: { itemList: [fixture(type)] } };
    } });
    assert.equal(count, 1); assert.equal(result.type, type); assert.equal(result.items.length, 1);
    assert.ok(result.items[0].title); assert.ok(result.items[0].price);
  }
});

test('specific query errors, empty and wrong-category results never substitute hotels', async () => {
  const request = { query: '明天北京到上海航班' };
  let calls = 0;
  assert.match((await searchFliggyTravel({ query: '飞猪机票' }, { run: () => { throw Error('must not call'); } })).clarification, /日期/);
  await assert.rejects(searchFliggyTravel(request, { run: async () => { calls++; throw Error('upstream failed'); } }), /upstream failed/);
  assert.equal(calls, 1);
  assert.equal((await searchFliggyTravel(request, { run: async () => ({ status: 0, data: { itemList: [fixture('hotel')] } }) })).items.length, 0);
  await assert.rejects(searchFliggyTravel(request, { run: async () => ({ status: 403 }) }), /查询失败/);
  assert.equal(normalizeFliggyItems([fixture('poi')], 'poi')[0].price, '¥399');
});

test('untyped questions use semantic search and retain provider empty results', async () => {
  const result = await searchFliggyTravel({ query: '飞猪推荐三亚自由行' }, { run: async (cmd) => {
    assert.equal(cmd, 'ai-search'); return { status: 0, data: { itemList: [] } };
  } });
  assert.equal(result.type, 'all'); assert.deepEqual(result.items, []);
});

test('chat preserves travel intent, renders each category, and makes no JD or LLM call', async () => {
  const graph = new KnowledgeGraph(); seedBase(graph);
  for (const [query, type] of [['飞猪查明天北京到上海航班', 'flight'], ['飞猪查明天北京到上海高铁', 'train'], ['在飞猪买上海迪士尼门票', 'poi'], ['帮我在飞猪查三亚亲子酒店', 'hotel']]) {
    let calls = 0;
    globalThis.fetch = async (endpoint, options) => {
      calls++; assert.equal(endpoint, '/api/fliggy/search');
      const body = JSON.parse(options.body); assert.equal(body.type, type);
      return { ok: true, json: async () => ({ type, items: normalizeFliggyItems([fixture(type)], type) }) };
    };
    const result = await handleUserMessage(query, { graph });
    assert.equal(calls, 1); assert.equal(result.views[0].type, 'fliggy_travel');
    assert.match(result.reply, /飞猪 AI 开放平台实时搜索/);
    if (type === 'flight' || type === 'train') assert.doesNotMatch(result.reply, /酒店/);
  }
  globalThis.fetch = () => { throw Error('must not query'); };
  assert.match((await handleUserMessage('飞猪查机票', { graph })).reply, /出发地/);
  graph.updateEntity('fliggy_travel_search', { enabled: false });
  assert.match((await handleUserMessage('飞猪上海迪士尼门票', { graph })).reply, /禁用/);
});
