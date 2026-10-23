import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { KnowledgeGraph } from '../src/ontology/graph.js';

let server, seedBase, handleUserMessage;
const originalFetch = globalThis.fetch;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  ({ seedBase } = await server.ssrLoadModule('/src/ontology/seed.js'));
  ({ handleUserMessage } = await server.ssrLoadModule('/src/agents/orchestrator.js'));
});
after(async () => { globalThis.fetch = originalFetch; await server?.close(); });

test('unverified supermarket cache never becomes a real comparison, screenshot proof or JD substitution', async () => {
  const graph = new KnowledgeGraph(); seedBase(graph);
  globalThis.fetch = () => { throw Error('must not query JD or overwrite runtime data'); };
  const before = graph.findEntities('PriceOffer').length;
  for (const text of ['对比沃尔玛、比优特和华润万家的价格', '比优特和沃尔玛买苹果哪个划算', '比优特和沃尔玛买茉莉花茶哪个划算', '沃尔玛买火星矿泉水哪个便宜']) {
    const result = await handleUserMessage(text, { graph });
    assert.match(result.reply, /旧报价未经核验/);
    assert.match(result.reply, /不会自动替换平台/);
    assert.doesNotMatch(result.reply, /最划算 ¥|核验时间：/);
    assert.deepEqual(result.views, []);
  }
  assert.equal(graph.findEntities('PriceOffer').length, before);
});
