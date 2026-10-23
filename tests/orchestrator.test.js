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

test('family profiles and weather are typed home modules backed by agent capabilities', async () => {
  const graph = fixture();
  const profile = await handleUserMessage('爸爸是素食主义者', { graph });
  assert.ok(profile.views.some(v => v.type === 'profiles' && v.capabilityId === 'update_member_profile' && !v.auto));

  const weather = await handleUserMessage('今天天气怎么样', { graph });
  assert.deepEqual(weather.views.map(v => [v.type, v.capabilityId]), [['weather', 'query_weather']]);

  for (const [text, type] of [['显示天气', 'weather'], ['把家庭档案放到最上面', 'profiles']]) {
    const result = await handleUserMessage(text, { graph });
    assert.equal(result.layout.modules[0], type);
    assert.ok(result.views.some(v => v.type === type && v.auto));
  }
});

test('Direction A: ontology-driven mutatesClass/readsClass dependency graph triggers dependent capabilities', async () => {
  const graph = fixture();
  assert.ok(graph.objects('update_member_profile', 'mutatesClass').includes('class_FamilyMember'));
  assert.ok(graph.objects('recommend_produce', 'readsClass').includes('class_FamilyMember'));
  assert.ok(graph.objects('recommend_recipes', 'readsClass').includes('class_FamilyMember'));
  assert.ok(graph.objects('r_kiwi_yogurt', 'extrasContainAllergen').includes('allergen_milk'));

  // Milk allergy excludes recipes whose dairy allergen comes from extras
  await handleUserMessage('爸爸对牛奶过敏', { graph });
  const recipeRes = await executeCapability(graph.getEntity('recommend_recipes'), { member: '爸爸' }, { graph });
  assert.ok(!recipeRes.reply.includes('猕猴桃酸奶杯'));
});

test('Direction B: HealthRecord & TaskLog temporal events record observations and performer-accurate scores', async () => {
  const graph = fixture();
  graph.addEntity({ id: 'ming', type: 'FamilyMember', name: '小明' });
  graph.addEntity({ id: 'hua', type: 'FamilyMember', name: '小花' });
  graph.addTriple('task_task1', 'assignedTo', 'ming');
  graph.addTriple('task_task1', 'assignedTo', 'hua');

  // Specific performer check-in credits only 小明, not 小花
  const doneRes = await handleUserMessage('小明完成了整理玩具房间', { graph });
  assert.match(doneRes.reply, /小明 \+10 积分/);
  const logs = graph.findEntities('TaskLog');
  assert.equal(logs.length, 1);
  assert.deepEqual(graph.objects(logs[0].id, 'completedBy'), ['ming']);

  // HealthRecord observation for blood pressure and medication
  const bpRes = await handleUserMessage('记录爸爸今天血压 135/85', { graph });
  assert.match(bpRes.reply, /135\/85/);
  assert.equal(bpRes.views[0].type, 'health_records');
  const hrecs = graph.findEntities('HealthRecord');
  assert.equal(hrecs.length, 1);
  assert.equal(hrecs[0].metric, '血压');
  assert.equal(hrecs[0].value, '135/85');
  assert.deepEqual(graph.objects(hrecs[0].id, 'recordFor'), ['dad']);

  const queryRes = await handleUserMessage('查看爸爸的血压记录', { graph });
  assert.match(queryRes.reply, /135\/85/);
});

test('Direction C: PantryItem inventory and smart recipe restock calculate missing ingredients and auto-order', async () => {
  const graph = fixture();
  // Base pantry has 鸡蛋 (ing_egg), so 番茄炒蛋 (ing_tomato + ing_egg) is only missing 番茄 (ing_tomato)
  const restock = await handleUserMessage('做番茄炒蛋还差什么，帮我下单买齐', { graph });
  assert.match(restock.reply, /缺少：番茄/);
  assert.ok(restock.views.some(v => v.type === 'order'));
  assert.ok(restock.views.some(v => v.type === 'pantry'));
  const order = graph.findEntities('Order')[0];
  assert.ok(order);
  assert.deepEqual(graph.objects(order.id, 'orderContains'), ['ing_tomato']);

  // Adding 番茄 to pantry makes 番茄炒蛋 ready to cook without missing ingredients
  await handleUserMessage('冰箱里还有2个番茄', { graph });
  const after = await handleUserMessage('做番茄炒蛋还差什么', { graph });
  assert.match(after.reply, /库存充足|食材已齐全/);
});

test('Ego-lite Browser Agent: governed sites, real video contract and BrowserTaskRun lineage', async () => {
  const graph = fixture();
  // Verify TBox/ABox browser site governance relations
  const allowedSites = graph.objects('search_video_with_browser', 'usesBrowserSite');
  assert.deepEqual(new Set(allowedSites), new Set(['site_bilibili', 'site_douyin', 'site_bing_video', 'site_xiachufang']));

  // Simulate server-side ego-lite bridge returning real extracted Bilibili video URLs
  globalThis.fetch = async (url, options) => {
    if (url === '/api/ego-browser/search-video') {
      const body = JSON.parse(options.body);
      assert.equal(body.siteId, 'site_bilibili');
      assert.match(body.query, /番茄炒蛋/);
      assert.equal(body.searchUrl, undefined);
      return {
        ok: true,
        json: async () => ({
          bestTitle: '【保姆级教程】家常番茄炒蛋，鲜嫩多汁秘诀',
          bestUrl: 'https://www.bilibili.com/video/BV1xx411c7mD',
          candidates: [
            { title: '【保姆级教程】家常番茄炒蛋，鲜嫩多汁秘诀', url: 'https://www.bilibili.com/video/BV1xx411c7mD' },
            { title: '大厨教你西红柿炒鸡蛋', url: 'https://www.bilibili.com/video/BV1yy411c7mE' },
          ],
          engine: 'ego-browser-live',
        }),
      };
    }
    throw new Error('unexpected fetch');
  };

  const res = await handleUserMessage('帮爸爸在B站搜索番茄炒蛋的做法视频', { graph });
  assert.match(res.reply, /BV1xx411c7mD/);
  assert.equal(res.views[0].type, 'video_search');

  const runs = graph.findEntities('BrowserTaskRun');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].bestUrl, 'https://www.bilibili.com/video/BV1xx411c7mD');
  assert.equal(runs[0].engine, 'ego-browser-live');
  assert.deepEqual(graph.objects(runs[0].id, 'executedByAgent'), ['agent_video']);
  assert.deepEqual(graph.objects(runs[0].id, 'targetsSite'), ['site_bilibili']);
  assert.deepEqual(graph.objects(runs[0].id, 'requestedFor'), ['dad']);
});

test('Douyin requests use the authorized site with cleaned keywords, including with AI configured', async () => {
  const graph = fixture();
  plan([], graph);
  let requests = 0;
  const url = 'https://www.douyin.com/video/7574037689771593006';
  globalThis.fetch = async (endpoint, options) => {
    assert.equal(endpoint, '/api/ego-browser/search-video');
    const body = JSON.parse(options.body);
    assert.equal(body.siteId, 'site_douyin');
    assert.equal(body.query, '八段锦教学视频');
    requests++;
    return { ok: true, json: async () => ({ engine: 'ego-browser-live', candidates: [{ title: '八段锦跟练', url }] }) };
  };
  for (const text of ['在抖音搜索八段锦教学视频', '帮爸爸去抖音上找八段锦教学视频', '在 Douyin 找八段锦教学视频', '搜索抖音上的八段锦教学视频']) {
    const result = await handleUserMessage(text, { graph });
    assert.match(result.reply, /7574037689771593006/);
    const run = graph.getEntity(result.views[0].args.runId);
    assert.equal(run.status, 'succeeded');
    assert.deepEqual(graph.objects(run.id, 'targetsSite'), ['site_douyin']);
  }
  assert.equal(requests, 4);
});

test('video search executes the bridge with AI configured, even when the model would refuse tools', async () => {
  const graph = fixture();
  plan([], graph);
  let bridgeCalls = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/ego-browser/search-video', 'explicit video intent must not ask the LLM for permission');
    const body = JSON.parse(options.body);
    assert.match(body.query, /八段锦/);
    bridgeCalls++;
    return { ok: true, json: async () => ({
      candidates: [{ title: '八段锦完整教学', url: 'https://www.bilibili.com/video/BV1gT4y1m7ec/' }],
      engine: 'ego-browser-live',
    }) };
  };
  for (const text of ['帮爸爸在B站搜索八段锦教学视频', '在b站找八段锦教学视频', '搜索八段锦的视频']) {
    const result = await handleUserMessage(text, { graph });
    assert.match(result.reply, /BV1gT4y1m7ec/);
    assert.doesNotMatch(result.reply, /没有浏览器工具|无法调用服务端/);
  }
  assert.equal(bridgeCalls, 3);
  graph.updateEntity('search_video_with_browser', { enabled: false });
  delete globalThis.window;
  await handleUserMessage('搜索八段锦视频', { graph });
  assert.equal(bridgeCalls, 3, 'disabled capability must not execute');
});
