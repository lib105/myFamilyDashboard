import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { KnowledgeGraph } from '../src/ontology/graph.js';
import { setMemberAttribute } from '../src/ontology/queries.js';
import { recommendIngredients, recommendRecipes } from '../src/agents/recommender.js';
import { mergeViews, stampViews, DEFAULT_VIEWS } from '../src/components/home/homeViews.js';

let server;
let seedBase;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  ({ seedBase } = await server.ssrLoadModule('/src/ontology/seed.js'));
});
after(async () => { await server?.close(); });

function fixture(diet) {
  const graph = new KnowledgeGraph();
  seedBase(graph);
  graph.addEntity({ id: 'dad', type: 'FamilyMember', name: '爸爸' });
  graph.addEntity({ id: 'mom', type: 'FamilyMember', name: '妈妈' });
  if (diet) setMemberAttribute(graph, 'dad', '饮食类型', diet);
  return graph;
}
const ingredientIds = result => result.items.map(i => i.ingredient.id);
const recipeIds = result => result.recipes.map(r => r.recipe.id);

test('seed ingredients and all extras have explicit, valid source relationships', () => {
  const graph = fixture();
  for (const ingredient of graph.findEntities('Ingredient')) {
    const sources = graph.objects(ingredient.id, 'derivedFrom');
    assert.ok(sources.length, ingredient.label);
    assert.ok(sources.every(id => graph.getEntity(id)?.type === 'FoodSource'));
  }
  for (const recipe of graph.findEntities('Recipe').filter(r => r.extras?.length)) {
    assert.ok(graph.objects(recipe.id, 'extrasDerivedFrom').length, recipe.label);
  }
});

test('vegetarian excludes meat, fish and seafood but retains tofu, eggs and dairy', () => {
  const graph = fixture('vegetarian');
  const result = recommendIngredients(graph, { month: 10 });
  const ids = ingredientIds(result);
  for (const id of ['tofu', 'egg', 'milk']) assert.ok(ids.includes(`ing_${id}`));
  for (const id of ['beef', 'chicken_breast', 'salmon', 'shrimp', 'crab']) {
    assert.ok(!ids.includes(`ing_${id}`));
    assert.match(result.excluded.find(e => e.ingredient.id === `ing_${id}`).reason, /爸爸.*素食/);
  }
  const protein = recommendIngredients(graph, { category: 'protein' });
  assert.deepEqual(new Set(ingredientIds(protein)), new Set(['ing_tofu', 'ing_egg', 'ing_milk']));
});

test('vegan excludes eggs, dairy, honey, and mixed animal-source ingredients', () => {
  const graph = fixture('vegan');
  for (const [id, sources] of [['honey', ['food_animal_other']], ['mixed', ['food_plant', 'food_dairy']]]) {
    graph.addEntity({ id, type: 'Ingredient', label: id });
    sources.forEach(s => graph.addTriple(id, 'derivedFrom', s));
  }
  const result = recommendIngredients(graph);
  assert.ok(ingredientIds(result).includes('ing_tofu'));
  for (const id of ['ing_egg', 'ing_milk', 'honey', 'mixed']) {
    assert.ok(result.excluded.some(e => e.ingredient.id === id && /爸爸.*纯素/.test(e.reason)));
  }
});

test('member-specific recommendations isolate constraints; shared meals combine targets', () => {
  const graph = fixture('vegetarian');
  setMemberAttribute(graph, 'mom', '饮食类型', 'vegan');
  assert.ok(ingredientIds(recommendIngredients(graph, { memberIds: ['dad'] })).includes('ing_egg'));
  assert.ok(!ingredientIds(recommendIngredients(graph)).includes('ing_egg'));
  setMemberAttribute(graph, 'mom', '饮食类型', 'omnivore');
  assert.ok(ingredientIds(recommendIngredients(graph, { memberIds: ['mom'] })).includes('ing_beef'));
  assert.ok(!ingredientIds(recommendIngredients(graph)).includes('ing_beef'));
});

test('allergy exclusions remain first and health, season, and unrestricted scoring are unchanged', () => {
  const graph = fixture();
  const unrestricted = recommendIngredients(graph, { month: 10 });
  assert.equal(unrestricted.excluded.length, 0);
  assert.equal(unrestricted.items.length, graph.findEntities('Ingredient').length);
  const tofu = unrestricted.items.find(i => i.ingredient.id === 'ing_tofu');
  assert.equal(tofu.score, 3 + tofu.facts.benefits.length * 0.2);
  graph.addTriple('dad', 'hasCondition', 'cond_hypertension');
  const healthy = recommendIngredients(graph, { month: 10 });
  assert.equal(healthy.items.find(i => i.ingredient.id === 'ing_apple').score, 5);
  setMemberAttribute(graph, 'dad', '饮食类型', 'vegan');
  graph.addTriple('dad', 'allergicTo', 'allergen_milk');
  const milk = recommendIngredients(graph).excluded.find(e => e.ingredient.id === 'ing_milk');
  assert.match(milk.reason, /爸爸.*过敏/);
  assert.doesNotMatch(milk.reason, /纯素/);
});

test('whole recipes are excluded with explanations, preserving meals and mean scoring', () => {
  const graph = fixture('vegetarian');
  const result = recommendRecipes(graph, { month: 10, limit: 100 });
  for (const id of ['r_radish_beef', 'r_salmon_broccoli', 'r_chicken_cabbage', 'r_shrimp_cucumber']) {
    assert.ok(!recipeIds(result).includes(id));
    assert.match(result.excluded.find(e => e.recipe.id === id).reason, /爸爸.*素食/);
  }
  for (const id of ['r_tomato_egg', 'r_spinach_tofu', 'r_kiwi_yogurt']) assert.ok(recipeIds(result).includes(id));
  const breakfast = recommendRecipes(graph, { mealType: '早餐', limit: 100 });
  assert.ok(breakfast.recipes.every(r => r.recipe.mealType.includes('早餐')));
  const sample = result.recipes[0];
  assert.equal(sample.score, sample.ingredients.reduce((sum, i) => sum + i.score, 0) / sample.ingredients.length
    + (sample.ingredients.every(i => i.inSeason) ? 1 : 0));
  setMemberAttribute(graph, 'dad', '饮食类型', 'vegan');
  const vegan = recommendRecipes(graph, { limit: 100 });
  assert.ok(!recipeIds(vegan).includes('r_tomato_egg'));
  assert.ok(!recipeIds(vegan).includes('r_kiwi_yogurt'));
  graph.addTriple('mom', 'allergicTo', 'allergen_soy');
  assert.match(recommendRecipes(graph, { limit: 100 }).excluded.find(e => e.recipe.id === 'r_spinach_tofu').reason, /妈妈.*过敏/);
});

test('unknown sources, dangling recipe ingredients and unclassified extras are not diet-certified', () => {
  const graph = fixture('vegetarian');
  graph.addEntity({ id: 'unknown', type: 'Ingredient', label: '未知食材', category: 'vegetable' });
  graph.addEntity({ id: 'extra', type: 'Recipe', label: '未分类辅料', extras: ['未知酱料'] });
  graph.addTriple('extra', 'usesIngredient', 'ing_tofu');
  graph.addEntity({ id: 'dangling', type: 'Recipe', label: '缺失食材' });
  // Persisted legacy knowledge may include a missing ingredient reference.
  graph.triples.set('legacy-dangling', { s: 'dangling', p: 'usesIngredient', o: 'missing' });
  assert.match(recommendIngredients(graph).excluded.find(e => e.ingredient.id === 'unknown').reason, /来源信息不完整/);
  const result = recommendRecipes(graph, { limit: 100 });
  for (const id of ['extra', 'dangling']) assert.match(result.excluded.find(e => e.recipe.id === id).reason, /来源信息不完整/);
  setMemberAttribute(graph, 'dad', '饮食类型', 'omnivore');
  assert.ok(ingredientIds(recommendIngredients(graph)).includes('unknown'));
  assert.ok(recipeIds(recommendRecipes(graph, { limit: 100 })).includes('extra'));
});

test('graph subscriptions recalculate existing recipe cards, and merge replaces default cards without duplicates', () => {
  const graph = fixture();
  let displayed;
  const args = { memberIds: ['dad'], mealType: '晚餐', limit: 100 };
  const unsubscribe = graph.subscribe(() => { displayed = recommendRecipes(graph, args); });
  assert.ok(recipeIds(recommendRecipes(graph, args)).includes('r_radish_beef'));
  setMemberAttribute(graph, 'dad', '饮食类型', 'vegetarian');
  assert.ok(!recipeIds(displayed).includes('r_radish_beef'));
  unsubscribe();
  const filtered = { id: 'filtered', type: 'recipes', args: { memberIds: ['dad'], mealType: '早餐' } };
  const incoming = stampViews([
    { type: 'produce', args: { memberIds: undefined, category: 'all' } },
    { type: 'recipes', args: { mealType: undefined, memberIds: undefined } },
    { type: 'recipes', args: {} },
  ]);
  const merged = mergeViews([...DEFAULT_VIEWS, filtered], incoming);
  assert.equal(merged.filter(v => v.type === 'produce').length, 1);
  assert.equal(merged.filter(v => v.type === 'recipes').length, 2);
  assert.ok(merged.some(v => v.id === 'filtered'));
});
