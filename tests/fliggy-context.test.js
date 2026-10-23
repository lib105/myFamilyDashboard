import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { KnowledgeGraph } from '../src/ontology/graph.js';
import { resolveFliggyTurn, recentFliggyContext, isFliggyContextReply } from '../src/agents/fliggyContext.js';

const now = new Date('2026-10-22T07:00:00Z');
const flightHistory = [{ role: 'user', text: '飞猪查10月25日大连到三亚的机票' }];

test('screenshot follow-up inherits Sanya and Oct 25, not today or the departure city', () => {
  const result = resolveFliggyTurn({ query: '再查查同日的酒店' }, flightHistory, now);
  assert.equal(result.context.destName, '三亚'); assert.equal(result.context.checkInDate, '2026-10-25');
  assert.equal(result.context.checkOutDate, undefined);
  assert.match(result.request.error, /三亚、2026-10-25入住/);
  assert.match(result.request.error, /退房日期|住几晚/);
  assert.doesNotMatch(result.request.error, /请补充酒店目的地|2026-10-22/);
});

test('a confirmed number of nights completes the pending hotel dates without an AI call', () => {
  const pending = resolveFliggyTurn({ query: '再查查同日的亲子酒店' }, flightHistory, now);
  const history = [...flightHistory, { role: 'user', text: '再查查同日的亲子酒店' }, { role: 'assistant', fliggyContext: pending.context }];
  const result = resolveFliggyTurn({ query: '住两晚' }, history, now);
  assert.equal(result.request.error, undefined);
  assert.equal(result.request.type, 'hotel'); assert.equal(result.request.destName, '三亚');
  assert.equal(result.request.checkInDate, '2026-10-25'); assert.equal(result.request.checkOutDate, '2026-10-27');
  assert.equal(result.request.keywords, '三亚亲子酒店');
  const checkout = resolveFliggyTurn({ query: '10月28日退房' }, history, now);
  assert.equal(checkout.request.checkInDate, '2026-10-25'); assert.equal(checkout.request.checkOutDate, '2026-10-28');
  const today = resolveFliggyTurn({ query: '再查今天入住明天退房的三亚酒店' }, history, now);
  assert.equal(today.request.checkInDate, '2026-10-22'); assert.equal(today.request.checkOutDate, '2026-10-23');
});

test('new explicit city wins, missing context asks, and unrelated turns do not revive a trip', () => {
  assert.equal(resolveFliggyTurn({ query: '再查上海同日的酒店' }, flightHistory, now).context.destName, '上海');
  assert.match(resolveFliggyTurn({ query: '再查同日酒店' }, [], now).request.error, /目的地/);
  assert.equal(recentFliggyContext([...flightHistory, { role: 'user', text: '今天天气怎么样' }], now), null);
  assert.equal(isFliggyContextReply('明天天气怎么样', [{ role: 'assistant', fliggyContext: { type: 'hotel', destName: '三亚' } }]), false);
});

let vite, seedBase, handleUserMessage;
const originalFetch = globalThis.fetch;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  ({ seedBase } = await vite.ssrLoadModule('/src/ontology/seed.js'));
  ({ handleUserMessage } = await vite.ssrLoadModule('/src/agents/orchestrator.js'));
});
after(async () => { globalThis.fetch = originalFetch; await vite?.close(); });

test('chat propagates per-conversation context through flight → same-day hotel → two nights', async () => {
  const graph = new KnowledgeGraph(); seedBase(graph);
  const history = [];
  let queries = 0;
  globalThis.fetch = async (endpoint, options) => {
    queries++; assert.equal(endpoint, '/api/fliggy/search');
    const body = JSON.parse(options.body);
    if (queries === 1) { assert.equal(body.type, 'flight'); assert.equal(body.destination, '三亚'); }
    else {
      assert.equal(body.type, 'hotel'); assert.equal(body.destName, '三亚');
      assert.equal(body.checkInDate, '2099-10-25'); assert.equal(body.checkOutDate, '2099-10-27');
    }
    return { ok: true, json: async () => ({ type: body.type, criteria: body, items: [{ id: 'result', title: '接口结果' }] }) };
  };
  const ask = async text => {
    const result = await handleUserMessage(text, { graph, history });
    history.push({ role: 'user', text }, { role: 'assistant', text: result.reply, fliggyContext: result.fliggyContext });
    return result;
  };
  await ask('飞猪查2099年10月25日大连到三亚机票');
  const pending = await ask('再查查同日的酒店');
  assert.equal(queries, 1); assert.match(pending.reply, /三亚、2099-10-25入住/);
  assert.equal(pending.fliggyContext.type, 'hotel');
  const completed = await ask('住两晚');
  assert.equal(queries, 2); assert.match(completed.reply, /三亚.*入住日期：2099-10-25.*退房日期：2099-10-27/);
  assert.equal(completed.views[0].args.criteria.destName, '三亚');
  // Separate conversation must not read the first chat's latest result from the shared graph.
  const isolated = await handleUserMessage('再查同日酒店', { graph, history: [] });
  assert.match(isolated.reply, /目的地城市/); assert.equal(queries, 2);
});
