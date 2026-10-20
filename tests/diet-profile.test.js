import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { KnowledgeGraph } from '../src/ontology/graph.js';
import { dietaryTypeFromAttributes, normalizeDietAttribute } from '../src/ontology/diet.js';
import { setMemberAttribute, upsertMember } from '../src/ontology/queries.js';
import { extractProfileUpdates } from '../src/agents/profileExtractor.js';
import { FOOD_SOURCES } from '../src/ontology/schema.js';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let migrateLegacyKnowledge;
let seedBase;
try {
  ({ migrateLegacyKnowledge, seedBase } = await server.ssrLoadModule('/src/ontology/seed.js'));
} finally {
  await server.close();
}

function setup(storage) {
  const graph = new KnowledgeGraph({ storage, storageKey: 'diet-test' });
  const { member } = upsertMember(graph, '爸爸');
  return { graph, member };
}

test('base ingredients use explicit source relations and new ingredients remain unknown', () => {
  const graph = new KnowledgeGraph();
  seedBase(graph);
  assert.deepEqual(graph.findEntities('FoodSource').map(s => s.id), FOOD_SOURCES.map(s => s.id));
  for (const ingredient of graph.findEntities('Ingredient')) {
    assert.equal(graph.objects(ingredient.id, 'derivedFrom').length, 1, ingredient.id);
    assert.equal(graph.query({ s: ingredient.id, p: 'derivedFrom' })[0].layer, 'base');
  }
  assert.deepEqual(graph.objects('ing_tofu', 'derivedFrom'), ['food_plant']);
  assert.deepEqual(graph.objects('ing_egg', 'derivedFrom'), ['food_egg']);
  assert.deepEqual(graph.objects('ing_salmon', 'derivedFrom'), ['food_fish']);
  graph.addEntity({ id: 'new-ingredient', type: 'Ingredient', label: '未知食材', category: 'vegetable' });
  migrateLegacyKnowledge(graph);
  assert.deepEqual(graph.objects('new-ingredient', 'derivedFrom'), []);
});

test('recipe extras have explicit audited base source relations', () => {
  const graph = new KnowledgeGraph();
  seedBase(graph);
  assert.deepEqual(graph.objects('r_kiwi_yogurt', 'extrasDerivedFrom'), ['food_dairy']);
  assert.deepEqual(graph.objects('r_pear_soup', 'extrasDerivedFrom'), ['food_plant', 'food_fungus']);
  for (const triple of graph.query({ p: 'extrasDerivedFrom' })) {
    assert.equal(triple.layer, 'base');
    assert.equal(graph.getEntity(triple.s).type, 'Recipe');
    assert.equal(graph.getEntity(triple.o).type, 'FoodSource');
  }
  graph.addEntity({ id: 'new-recipe', type: 'Recipe', label: '未审核菜谱', extras: '未知辅料' });
  migrateLegacyKnowledge(graph);
  assert.deepEqual(graph.objects('new-recipe', 'extrasDerivedFrom'), []);
});

test('normalization accepts exact dietary declarations, not food avoidance or guesses', () => {
  for (const [value, expected] of [
    ['素食主义者', 'vegetarian'], ['是素食主义者', 'vegetarian'], ['吃素', 'vegetarian'],
    ['纯素', 'vegan'], ['纯素食主义者', 'vegan'], ['VEGAN', 'vegan'],
    ['不吃素', 'omnivore'], ['不再吃素', 'omnivore'], ['不是素食主义者', 'omnivore'],
    ['荤素都吃', 'omnivore'],
  ]) {
    assert.deepEqual(normalizeDietAttribute('饮食偏好', value), { key: '饮食类型', value: expected });
  }
  for (const value of [
    '不吃肉', '不吃肉类', '不吃荤', '不吃荤食', '忌荤', '不吃牛肉', '不吃猪肉',
    '不吃鸡肉', '不吃海鲜', '喜欢吃素', '不喜欢吃素', '不是纯素', '素食主义者吗', '不一定吃素',
  ]) {
    assert.deepEqual(normalizeDietAttribute('饮食禁忌', value), { key: '饮食禁忌', value });
    assert.equal(dietaryTypeFromAttributes([{ key: '饮食禁忌', value }]), undefined);
  }
  assert.deepEqual(normalizeDietAttribute('备注', '素食'), { key: '备注', value: '素食' });
  assert.equal(dietaryTypeFromAttributes(undefined), undefined);
  assert.equal(dietaryTypeFromAttributes([null, {}, '素食']), undefined);
});

test('canonical values take precedence over stale legacy restrictions', () => {
  assert.equal(dietaryTypeFromAttributes([
    { key: '饮食类型', value: 'omnivore' },
    { key: '饮食禁忌', value: '纯素' },
  ]), 'omnivore');
  assert.equal(dietaryTypeFromAttributes([{ key: '饮食习惯', value: '素食' }]), 'vegetarian');
});

test('local extraction handles declarations and explicit unrestricted changes', () => {
  const { graph } = setup();
  for (const [text, expected] of [
    ['爸爸是素食主义者', 'vegetarian'], ['爸爸吃素', 'vegetarian'], ['爸爸是蛋奶素', 'vegetarian'],
    ['爸爸纯素', 'vegan'], ['爸爸是纯素食主义者', 'vegan'],
    ['爸爸不是素食主义者', 'omnivore'], ['爸爸不吃素', 'omnivore'],
    ['爸爸不再吃素', 'omnivore'], ['爸爸饮食类型：vegan', 'vegan'],
  ]) {
    const attrs = extractProfileUpdates(text, graph).flatMap(u => u.attributes);
    assert.equal(dietaryTypeFromAttributes(attrs), expected, text);
  }
});

test('questions, negations of vegan and dislikes do not assert restrictions', () => {
  const { graph, member } = setup();
  setMemberAttribute(graph, member.id, '饮食类型', 'vegetarian');
  for (const text of [
    '爸爸不是纯素', '爸爸不喜欢吃素', '爸爸不爱吃素', '爸爸是素食主义者吗',
    '爸爸不喜欢吃肉', '爸爸不爱吃荤', '爸爸不吃肉？', '爸爸不吃荤吗',
    '爸爸是蛋奶素吗', '爸爸是蛋奶素？', '爸爸不是蛋奶素', '爸爸并不是蛋奶素',
    '爸爸是素食主义者？', '爸爸是不是吃素', '爸爸吃素吗？', '爸爸不吃素？',
  ]) {
    const updates = extractProfileUpdates(text, graph);
    assert.equal(dietaryTypeFromAttributes(updates.flatMap(u => u.attributes)), undefined, text);
    updates.flatMap(u => u.attributes).forEach(a => setMemberAttribute(graph, member.id, a.key, a.value));
    assert.equal(dietaryTypeFromAttributes(graph.objects(member.id, 'hasAttribute')), 'vegetarian', text);
  }
});

test('AI-style setters replace all recognized diet attrs but retain specific food preferences', () => {
  const { graph, member } = setup();
  for (const attr of [
    { key: '饮食偏好', value: '吃素' }, { key: '饮食禁忌', value: '纯素' },
    { key: '饮食禁忌', value: '不吃牛肉' }, { key: '饮食偏好', value: '喜欢吃苹果' },
  ]) graph.addTriple(member.id, 'hasAttribute', attr);
  setMemberAttribute(graph, member.id, '饮食习惯', '不再吃素');
  assert.deepEqual(graph.objects(member.id, 'hasAttribute'), [
    { key: '饮食禁忌', value: '不吃牛肉' }, { key: '饮食偏好', value: '喜欢吃苹果' },
    { key: '饮食类型', value: 'omnivore' },
  ]);
  setMemberAttribute(graph, member.id, '饮食类型', 'vegan');
  setMemberAttribute(graph, member.id, '饮食类型', '不是纯素');
  assert.equal(dietaryTypeFromAttributes(graph.objects(member.id, 'hasAttribute')), 'vegan');
  assert.equal(graph.objects(member.id, 'hasAttribute').filter(a => a.key === '饮食类型').length, 1);
});

test('local extraction preserves unrelated food avoidance alongside diet changes', () => {
  const { graph, member } = setup();
  const updates = extractProfileUpdates('爸爸吃素，不吃香菜，喜欢吃苹果', graph);
  for (const attr of updates[0].attributes) setMemberAttribute(graph, member.id, attr.key, attr.value);
  setMemberAttribute(graph, member.id, '饮食类型', 'omnivore');
  assert.deepEqual(graph.objects(member.id, 'hasAttribute'), [
    { key: '饮食禁忌', value: '不吃香菜' }, { key: '饮食偏好', value: '喜欢吃苹果' },
    { key: '饮食类型', value: 'omnivore' },
  ]);
});

test('food avoidance cannot downgrade a declared or persisted vegan diet', () => {
  for (const avoidance of ['不吃肉', '不吃肉类', '不吃荤', '不吃荤食', '忌荤']) {
    for (const text of [`爸爸吃纯素，${avoidance}`, `爸爸${avoidance}，吃纯素`]) {
      const { graph, member } = setup();
      extractProfileUpdates(text, graph).flatMap(u => u.attributes)
        .forEach(a => setMemberAttribute(graph, member.id, a.key, a.value));
      assert.equal(dietaryTypeFromAttributes(graph.objects(member.id, 'hasAttribute')), 'vegan', text);
    }
    const { graph, member } = setup();
    for (const update of extractProfileUpdates(`爸爸吃纯素，${avoidance}`, graph)) {
      update.attributes.forEach(a => setMemberAttribute(graph, member.id, a.key, a.value));
    }
    assert.equal(dietaryTypeFromAttributes(graph.objects(member.id, 'hasAttribute')), 'vegan', avoidance);
    setMemberAttribute(graph, member.id, '饮食禁忌', avoidance);
    assert.equal(dietaryTypeFromAttributes(graph.objects(member.id, 'hasAttribute')), 'vegan', avoidance);
    migrateLegacyKnowledge(graph);
    const attributes = graph.objects(member.id, 'hasAttribute');
    assert.equal(dietaryTypeFromAttributes(attributes), 'vegan', avoidance);
    assert.ok(attributes.some(a => a.key === '饮食禁忌' && a.value === avoidance), avoidance);
  }
});

test('every exact vegan alias coexists with all avoidance aliases in either legacy order', () => {
  const veganAliases = ['vegan', '纯素', '纯素食', '纯素食者', '纯素主义者', '纯素食主义者', '吃纯素', '只吃纯素', '严格素食'];
  const avoidanceAliases = ['不吃肉', '不吃肉类', '不吃荤', '不吃荤食', '忌荤'];
  const legacyKeys = ['饮食偏好', '饮食禁忌', '饮食习惯', '饮食方式', '饮食限制', '饮食'];
  for (const alias of veganAliases) {
    for (const avoidance of avoidanceAliases) {
      for (const key of legacyKeys) {
        const vegan = { key: '饮食偏好', value: alias };
        const unrelated = { key, value: avoidance };
        assert.equal(dietaryTypeFromAttributes([unrelated]), undefined, `${key}:${avoidance}`);
        assert.equal(dietaryTypeFromAttributes([vegan, unrelated]), 'vegan', `${alias},${avoidance}`);
        assert.equal(dietaryTypeFromAttributes([unrelated, vegan]), 'vegan', `${avoidance},${alias}`);
        const { graph, member } = setup();
        setMemberAttribute(graph, member.id, vegan.key, vegan.value);
        setMemberAttribute(graph, member.id, unrelated.key, unrelated.value);
        migrateLegacyKnowledge(graph);
        const attributes = graph.objects(member.id, 'hasAttribute');
        assert.equal(dietaryTypeFromAttributes(attributes), 'vegan', `${key}:${avoidance}`);
        assert.ok(attributes.some(a => a.key === key && a.value === avoidance));
      }
    }
  }
});

test('clause-level negated avoidance does not record an avoidance or dietary type', () => {
  for (const negation of ['并不是', '不是', '并非', '没有', '并没有']) {
    for (const avoidance of ['不吃肉', '不吃荤', '不吃素', '不吃香菜']) {
      const { graph, member } = setup();
      const text = `爸爸${negation}${avoidance}`;
      const attributes = extractProfileUpdates(text, graph).flatMap(u => u.attributes);
      assert.deepEqual(attributes, [], text);
      assert.equal(dietaryTypeFromAttributes(attributes), undefined, text);
      setMemberAttribute(graph, member.id, '饮食类型', 'vegan');
      attributes.forEach(a => setMemberAttribute(graph, member.id, a.key, a.value));
      assert.equal(dietaryTypeFromAttributes(graph.objects(member.id, 'hasAttribute')), 'vegan', text);
    }
  }
});

test('legacy migration persists canonical diets, preserves preferences and is idempotent', () => {
  let persisted;
  const storage = {
    setItem(_key, value) { persisted = value; },
    getItem() { return persisted; },
  };
  const { graph, member } = setup(storage);
  graph.addTriple(member.id, 'hasAttribute', { key: '饮食偏好', value: '素食主义者' });
  graph.addTriple(member.id, 'hasAttribute', { key: '饮食禁忌', value: '不吃牛肉' });
  migrateLegacyKnowledge(graph);
  assert.deepEqual(graph.objects(member.id, 'hasAttribute'), [
    { key: '饮食禁忌', value: '不吃牛肉' }, { key: '饮食类型', value: 'vegetarian' },
  ]);
  const snapshot = JSON.stringify(graph.snapshot());
  const version = graph.version;
  migrateLegacyKnowledge(graph);
  assert.equal(JSON.stringify(graph.snapshot()), snapshot);
  assert.equal(graph.version, version);
  const restored = new KnowledgeGraph({ storage, storageKey: 'diet-test' });
  assert.equal(restored.restore(), true);
  assert.equal(dietaryTypeFromAttributes(restored.objects(member.id, 'hasAttribute')), 'vegetarian');
  setMemberAttribute(restored, member.id, '饮食禁忌', '不吃素');
  assert.equal(dietaryTypeFromAttributes(restored.objects(member.id, 'hasAttribute')), 'omnivore');
});

test('migration resolves conflicting legacy attrs in favor of canonical current diet', () => {
  const { graph, member } = setup();
  graph.addTriple(member.id, 'hasAttribute', { key: '饮食类型', value: 'omnivore' });
  graph.addTriple(member.id, 'hasAttribute', { key: '饮食偏好', value: '纯素' });
  migrateLegacyKnowledge(graph);
  assert.deepEqual(graph.objects(member.id, 'hasAttribute'), [{ key: '饮食类型', value: 'omnivore' }]);
});
