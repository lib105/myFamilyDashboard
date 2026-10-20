import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { KnowledgeGraph } from '../src/ontology/graph.js';

let server;
let seedBase;
let handleUserMessage;
let executeCapability;
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  ({ seedBase } = await server.ssrLoadModule('/src/ontology/seed.js'));
  ({ handleUserMessage } = await server.ssrLoadModule('/src/agents/orchestrator.js'));
  ({ executeCapability } = await server.ssrLoadModule('/src/agents/capabilities.js'));
});
after(async () => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  await server?.close();
});

function fixture() {
  const graph = new KnowledgeGraph();
  seedBase(graph);
  graph.addEntity({ id: 'dad', type: 'FamilyMember', name: '爸爸' });
  graph.addEntity({ id: 'mom', type: 'FamilyMember', name: '妈妈' });
  delete globalThis.window;
  return graph;
}
const update = { capabilityId: 'update_member_profile', args: { updates: [
  { member: '爸爸', attributes: [{ key: '饮食类型', value: 'vegetarian' }] },
] } };
function plan(calls, graph, onRequest = () => {}) {
  globalThis.window = {
    localStorage: { getItem: () => null },
    sessionStorage: { getItem: () => 'test-placeholder' },
  };
  globalThis.fetch = async (_url, options) => {
    onRequest(JSON.parse(options.body), graph);
    return { ok: true, json: async () => ({ choices: [{ message: { tool_calls: calls.map(c => ({
      function: { name: c.capabilityId, arguments: JSON.stringify(c.args || {}) },
    })) } }] }) };
  };
}
const counts = result => ({
  produce: result.trace.filter(t => t.capability === '推荐当季食材/水果/蔬菜').length,
  recipes: result.trace.filter(t => t.capability === '推荐简单食谱').length,
});

test('local profile statements refresh both enabled recommendations after updating', async () => {
  const graph = fixture();
  const result = await handleUserMessage('爸爸是素食主义者', { graph });
  assert.equal(result.trace[0].capability, '记录家庭成员档案');
  assert.equal(result.views.filter(v => ['produce', 'recipes'].includes(v.type)).length, 2);
  assert.ok(result.views.filter(v => ['produce', 'recipes'].includes(v.type)).every(v => v.auto));
  assert.ok(graph.objects('dad', 'hasAttribute').some(a => a.value === 'vegetarian'));
});

test('local explicit family or other-member recommendations do not inherit the updated member target', async () => {
  for (const [text, memberIds] of [
    ['爸爸吃素，给全家推荐晚餐食谱', undefined],
    ['爸爸吃素，给妈妈推荐晚餐食谱', ['mom']],
  ]) {
    const graph = fixture();
    const result = await handleUserMessage(text, { graph });
    const view = result.views.find(v => v.type === 'recipes');
    assert.deepEqual(view.args.memberIds, memberIds);
    assert.equal(view.args.mealType, '晚餐');
  }
});

for (const explicit of [
  [{ capabilityId: 'recommend_produce', args: { member: '爸爸', category: 'protein' } }],
  [{ capabilityId: 'recommend_recipes', args: { member: '爸爸', mealType: '晚餐' } }],
  [{ capabilityId: 'recommend_produce', args: { member: '爸爸', category: 'protein' } },
    { capabilityId: 'recommend_recipes', args: { member: '妈妈', mealType: '早餐' } }],
]) {
  test(`LLM preserves explicit parameters, deduplicates, and fills missing recommendations: ${explicit.map(c => c.capabilityId)}`, async () => {
    const graph = fixture();
    plan([...explicit, update, ...explicit], graph);
    const result = await handleUserMessage('更新后推荐', { graph });
    assert.equal(result.trace[0].capability, '记录家庭成员档案');
    assert.deepEqual(counts(result), { produce: 1, recipes: 1 });
    for (const call of explicit) {
      const view = result.views.find(v => v.capabilityId === call.capabilityId);
      assert.deepEqual(view.args.memberIds, [call.args.member === '爸爸' ? 'dad' : 'mom']);
      if (call.args.category) assert.equal(view.args.category, call.args.category);
      if (call.args.mealType) assert.equal(view.args.mealType, call.args.mealType);
      assert.equal(view.auto, false);
    }
    // Produce explanations could only exist if it executed after the mutation.
    if (explicit[0].capabilityId === 'recommend_produce') assert.match(result.reply, /爸爸采用素食/);
  });
}

test('disabled or missing recommendations never execute, including explicit LLM plans', async () => {
  for (const missing of [false, true]) {
    const graph = fixture();
    if (missing) graph.entities.delete('recommend_recipes');
    else graph.updateEntity('recommend_recipes', { enabled: false });
    graph.updateEntity('recommend_produce', { enabled: false });
    plan([{ capabilityId: 'recommend_produce' }, update, { capabilityId: 'recommend_recipes' }], graph);
    const result = await handleUserMessage('更新档案', { graph });
    assert.deepEqual(counts(result), { produce: 0, recipes: 0 });
  }
});

test('disabled and no-op profile updates do not trigger automatic recommendations', async () => {
  const graph = fixture();
  graph.updateEntity('update_member_profile', { enabled: false });
  const local = await handleUserMessage('爸爸吃素', { graph });
  assert.equal(local.views.length, 0);
  plan([update], graph);
  assert.equal((await handleUserMessage('更新', { graph })).views.length, 0);
  graph.updateEntity('update_member_profile', { enabled: true });
  plan([{ capabilityId: 'update_member_profile', args: { updates: [] } }], graph);
  assert.equal((await handleUserMessage('更新', { graph })).views.length, 0);
});

test('empty recipe results still return a fresh recipe view with explicit filters', async () => {
  const graph = fixture();
  const result = await executeCapability(graph.getEntity('recommend_recipes'),
    { member: '爸爸', mealType: '不存在的餐次' }, { graph });
  assert.equal(result.views[0].type, 'recipes');
  assert.deepEqual(result.views[0].args, { memberIds: ['dad'], mealType: '不存在的餐次' });
  assert.match(result.reply, /没有找到/);
});

test('AI ingredient collection requires complete validated source metadata', async () => {
  for (const sources of [['food_plant'], ['food_plant', 'food_meat'], ['food_plant', 'invalid'], undefined]) {
    const graph = fixture();
    plan([], graph);
    globalThis.fetch = async (_url, options) => {
      assert.match(JSON.parse(options.body).messages[1].content, /foodSources/);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        label: '新食材', category: 'protein', foodSources: sources,
      }) } }] }) };
    };
    await executeCapability(graph.getEntity('collect_ingredient_data'), { items: ['新食材'] }, { graph });
    const ingredient = graph.findEntities('Ingredient').find(i => i.label === '新食材');
    assert.deepEqual(graph.objects(ingredient.id, 'derivedFrom'),
      sources?.every(s => s !== 'invalid') ? sources : []);
  }
});
