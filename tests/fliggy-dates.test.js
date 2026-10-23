import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KnowledgeGraph } from '../src/ontology/graph.js';
import { resolveFliggyRequest } from '../src/agents/fliggyRequest.js';
import { searchFliggyTravel, normalizeFliggyItems } from '../server/fliggyBridge.js';
import { travelDetailLines } from '../src/agents/fliggyPresentation.js';

const now = new Date('2026-10-22T16:30:00Z');
const segment = (extra = {}) => ({ marketingTransportNo: 'MU1234', transportType: '飞机', marketingTransportName: '东航', depStationName: '首都机场', arrStationName: '浦东机场', depDateTime: '2026-10-25 23:30:00', arrDateTime: '2026-10-26 01:40:00', seatClassName: '经济舱', depTerm: 'T2', arrTerm: 'T1', duration: '130', ...extra });
const rawItem = { journeys: [{ journeyType: '直达', segments: [segment()] }], ticketPrice: '700.00', totalDuration: '130' };

test('explicit dates in Chinese, slash, ISO and month/day survive arbitrary query positions', () => {
  for (const query of [
    '飞猪查10月25日从北京到上海的机票', '飞猪查询北京到上海10月25号机票',
    '飞猪查2026/10/25北京到上海的航班', '飞猪查2026年10月25日北京到上海航班',
    '飞猪查北京到上海的航班，10月25日出发', '飞猪查北京到上海的航班，出发日期10/25',
    '飞猪查北京到上海的航班，2026-10-25', '飞猪查北京到上海的航班，10-25',
  ]) {
    const result = resolveFliggyRequest({ query }, now);
    assert.equal(result.error, undefined, query);
    assert.equal(result.depDate, '2026-10-25', query);
    assert.equal(result.origin, '北京'); assert.equal(result.destination, '上海');
  }
  const train = resolveFliggyRequest({ query: '飞猪查2026年10月25日从北京到上海的高铁' }, now);
  assert.equal(train.type, 'train'); assert.equal(train.depDate, '2026-10-25');
});

test('invalid, past, ambiguous dates and incomplete hotel dates are not silently replaced with today', () => {
  for (const query of ['飞猪查2月30日北京到上海机票', '飞猪查2026-13-10北京到上海机票', '飞猪查2026-02-29北京到上海机票', '飞猪查2026年1月1日北京到上海机票', '飞猪查1月1日北京到上海机票']) {
    assert.ok(resolveFliggyRequest({ query }, now).error, query);
  }
  assert.match(resolveFliggyRequest({ query: '飞猪明天北京到上海机票', depDate: '2026-10-25' }, now).error, /不一致/);
  assert.match(resolveFliggyRequest({ query: '飞猪10月25日杭州酒店' }, now).error, /入住日期和退房日期/);
  assert.match(resolveFliggyRequest({ query: '飞猪10月28日入住10月25日退房杭州酒店' }, now).error, /退房日期/);
  assert.match(resolveFliggyRequest({ query: '飞猪10月25日上海迪士尼门票' }, now).error, /不支持按游玩日期核价/);
});

test('requested departure/return and hotel stay dates reach the corresponding CLI flags', async () => {
  for (const [query, command, expected] of [
    ['飞猪10月25日北京到上海机票', 'search-flight', ['--origin', '北京', '--destination', '上海', '--dep-date', '2026-10-25']],
    ['飞猪10月25日北京到上海高铁', 'search-train', ['--origin', '北京', '--destination', '上海', '--dep-date', '2026-10-25']],
    ['飞猪10月25日北京到上海往返机票10月28日返回', 'search-flight', ['--origin', '北京', '--destination', '上海', '--dep-date', '2026-10-25', '--back-date', '2026-10-28']],
    ['飞猪10月25日入住10月28日退房杭州酒店', 'search-hotel', ['--dest-name', '杭州', '--key-words', '杭州酒店', '--check-in-date', '2026-10-25', '--check-out-date', '2026-10-28']],
  ]) {
    let count = 0;
    const result = await searchFliggyTravel({ query }, { now, run: async (cmd, flags) => {
      count++; assert.equal(cmd, command); assert.deepEqual(flags, expected);
      return { status: 0, data: { itemList: [] } };
    } });
    assert.equal(count, 1);
    assert.equal(result.criteria.depDate || result.criteria.checkInDate, '2026-10-25');
  }
});

test('transport normalization preserves full dates, overnight arrivals, terminals and every transfer leg', () => {
  const items = normalizeFliggyItems([rawItem], 'flight');
  const normalized = items[0].journeys[0].segments[0];
  assert.equal(normalized.departureDateTime, '2026-10-25 23:30:00');
  assert.equal(normalized.arrivalDateTime, '2026-10-26 01:40:00');
  assert.equal(normalized.departureTerminal, 'T2');
  assert.match(travelDetailLines(items[0]).join('\n'), /出发：2026-10-25 23:30.*到达：2026-10-26 01:40/);
  const transfer = normalizeFliggyItems([{ ...rawItem, journeys: [{ journeyType: '中转', segments: [segment(), segment({ marketingTransportNo: 'MU4567', depStationName: '浦东机场', arrStationName: '虹桥机场' })] }] }], 'flight')[0];
  assert.equal(transfer.journeys[0].segments.length, 2);
  assert.match(travelDetailLines(transfer).join('\n'), /MU4567/);
  const missing = normalizeFliggyItems([{ ...rawItem, journeys: [{ segments: [segment({ arrDateTime: null, depStationName: null, duration: null })] }] }], 'flight')[0];
  const detail = travelDetailLines(missing).join('\n');
  assert.match(detail, /到达：未返回 未返回/); assert.doesNotMatch(detail, /undefined|null/);
});

let server, handleUserMessage, seedBase, Component;
const originalFetch = globalThis.fetch;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  ({ handleUserMessage } = await server.ssrLoadModule('/src/agents/orchestrator.js'));
  ({ seedBase } = await server.ssrLoadModule('/src/ontology/seed.js'));
  ({ default: Component } = await server.ssrLoadModule('/src/components/home/FliggyTravelView.jsx'));
});
after(async () => { globalThis.fetch = originalFetch; await server?.close(); });

test('chat and card use the same structured dates/times and show missing fields honestly', async () => {
  const graph = new KnowledgeGraph(); seedBase(graph);
  const date = '2099-10-25';
  globalThis.fetch = async (endpoint, options) => {
    assert.equal(endpoint, '/api/fliggy/search');
    const input = JSON.parse(options.body);
    assert.equal(input.depDate, date);
    const matchingItem = { ...rawItem, journeys: [{ journeyType: '直达', segments: [segment({ depDateTime: `${date} 23:30:00`, arrDateTime: '2099-10-26 01:40:00' })] }] };
    return { ok: true, json: async () => searchFliggyTravel(input, { now, run: async () => ({ status: 0, data: { itemList: [matchingItem] } }) }) };
  };
  const response = await handleUserMessage(`飞猪查${date}北京到上海机票`, { graph });
  assert.match(response.reply, /出发日期：2099-10-25/);
  assert.match(response.reply, /出发：2099-10-25 23:30/);
  assert.match(response.reply, /到达：2099-10-26 01:40/);
  const html = renderToStaticMarkup(createElement(Component, { args: response.views[0].args }));
  for (const field of ['2099-10-25', '2099-10-26', '23:30', '01:40', '首都机场', '浦东机场', 'T2', '经济舱', '130分钟']) assert.ok(html.includes(field), field);
  const missingHtml = renderToStaticMarkup(createElement(Component, { args: { items: normalizeFliggyItems([{ ...rawItem, journeys: [{ segments: [segment({ arrDateTime: null })] }] }], 'flight') } }));
  assert.match(missingHtml, /未返回/);
});
