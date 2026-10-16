/**
 * Domain-level queries and mutations over the knowledge graph. Agents use
 * these helpers instead of touching triples directly.
 */

export const KINSHIP = {
  爸爸: { avatar: '👨', role: 'parent' }, 妈妈: { avatar: '👩', role: 'parent' },
  爷爷: { avatar: '👴', role: 'elder' }, 奶奶: { avatar: '👵', role: 'elder' },
  外公: { avatar: '👴', role: 'elder' }, 外婆: { avatar: '👵', role: 'elder' },
  姥爷: { avatar: '👴', role: 'elder' }, 姥姥: { avatar: '👵', role: 'elder' },
  老公: { avatar: '👨', role: 'parent' }, 老婆: { avatar: '👩', role: 'parent' },
  儿子: { avatar: '👦', role: 'child' }, 女儿: { avatar: '👧', role: 'child' },
  哥哥: { avatar: '👦', role: 'child' }, 姐姐: { avatar: '👧', role: 'child' },
  弟弟: { avatar: '👦', role: 'child' }, 妹妹: { avatar: '👧', role: 'child' },
  宝宝: { avatar: '👶', role: 'child' }, 我: { avatar: '🙋', role: 'self' },
};

/** Attribute keys that hold a single value (new value replaces the old one). */
const SINGLE_VALUE_KEYS = new Set(['身高', '体重', '血压', '血糖', '性别', 'BMI', '运动量']);

const normalize = (s) => String(s || '').trim().toLowerCase();

let idCounter = 0;
export const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/* ---------- members ---------- */
export function getMembers(graph) {
  return graph.findEntities('FamilyMember');
}

export function findMember(graph, name) {
  const n = normalize(name);
  if (!n) return undefined;
  return getMembers(graph).find(m => normalize(m.name) === n);
}

export function getMemberProfile(graph, member) {
  return {
    member,
    conditions: graph.objects(member.id, 'hasCondition').map(id => graph.getEntity(id)).filter(Boolean),
    allergens: graph.objects(member.id, 'allergicTo').map(id => graph.getEntity(id)).filter(Boolean),
    attributes: graph.objects(member.id, 'hasAttribute'),
  };
}

export function getFamilyProfiles(graph) {
  return getMembers(graph).map(m => getMemberProfile(graph, m));
}

export function upsertMember(graph, name) {
  const existing = findMember(graph, name);
  if (existing) return { member: existing, created: false };
  const meta = KINSHIP[name] || { avatar: '🙂', role: 'member' };
  const member = graph.addEntity({ id: newId('member'), type: 'FamilyMember', name, ...meta });
  return { member, created: true };
}

export function removeMember(graph, memberId) {
  graph.removeEntity(memberId);
}

/* ---------- vocabulary resolution (synonyms → ontology entities) ---------- */
function resolveByLabel(graph, type, text) {
  const n = normalize(text);
  if (!n) return undefined;
  const all = graph.findEntities(type);
  return all.find(e => normalize(e.label) === n || (e.synonyms || []).some(s => normalize(s) === n))
    || all.find(e => n.includes(normalize(e.label)) || (e.synonyms || []).some(s => s.length > 1 && n.includes(normalize(s))));
}

export const resolveCondition = (graph, text) => resolveByLabel(graph, 'HealthCondition', text);
export const resolveAllergen = (graph, text) => resolveByLabel(graph, 'Allergen', text);
export const resolveIngredient = (graph, text) => resolveByLabel(graph, 'Ingredient', text);

/** Finds a condition or extends the ontology with a new one. */
export function ensureCondition(graph, text) {
  const found = resolveCondition(graph, text);
  if (found) return { entity: found, created: false };
  const label = String(text).trim();
  const entity = graph.addEntity({ id: newId('cond'), type: 'HealthCondition', label, emoji: '📝', synonyms: [label], advice: '' });
  return { entity, created: true };
}

export function ensureAllergen(graph, text) {
  const found = resolveAllergen(graph, text);
  if (found) return { entity: found, created: false };
  const label = String(text).trim();
  const entity = graph.addEntity({ id: newId('allergen'), type: 'Allergen', label, synonyms: [label] });
  return { entity, created: true };
}

export function setMemberAttribute(graph, memberId, key, value) {
  const attr = { key: String(key).trim(), value: String(value).trim() };
  if (!attr.key || !attr.value) return;
  if (SINGLE_VALUE_KEYS.has(attr.key)) {
    graph.objects(memberId, 'hasAttribute')
      .filter(a => a.key === attr.key)
      .forEach(a => graph.removeTriple(memberId, 'hasAttribute', a));
  }
  graph.addTriple(memberId, 'hasAttribute', attr);
}

/* ---------- ingredients ---------- */
export function getIngredients(graph) {
  return graph.findEntities('Ingredient');
}

export function getIngredientFacts(graph, ingredient) {
  const ent = (ids) => ids.map(id => graph.getEntity(id)).filter(Boolean);
  return {
    ingredient,
    benefits: ent(graph.objects(ingredient.id, 'benefits')),
    cautions: ent(graph.objects(ingredient.id, 'cautionFor')),
    allergens: ent(graph.objects(ingredient.id, 'containsAllergen')),
    seasons: ent(graph.objects(ingredient.id, 'availableIn')),
  };
}

/** Finds every ingredient mentioned in free text (longest labels first). */
export function findIngredientsInText(graph, text) {
  const found = [];
  let rest = String(text || '');
  const all = getIngredients(graph)
    .flatMap(i => [i.label, ...(i.synonyms || [])].map(name => ({ name, i })))
    .sort((a, b) => b.name.length - a.name.length);
  for (const { name, i } of all) {
    const idx = rest.indexOf(name);
    if (idx >= 0) {
      if (!found.some(f => f.ingredient.id === i.id)) found.push({ ingredient: i, index: idx, name });
      rest = rest.slice(0, idx) + ' '.repeat(name.length) + rest.slice(idx + name.length);
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/* ---------- capabilities ---------- */
export function getAgents(graph) {
  return graph.findEntities('Agent');
}

export function getCapabilities(graph, { enabledOnly = false } = {}) {
  return graph.findEntities('Capability', c => !enabledOnly || c.enabled !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

export function getCapabilityAgent(graph, capability) {
  const agentId = graph.objects(capability.id, 'providedBy')[0];
  return agentId ? graph.getEntity(agentId) : undefined;
}

export function findCapabilityByName(graph, name) {
  const n = normalize(name);
  return getCapabilities(graph).find(c => normalize(c.label) === n || normalize(c.id) === n)
    || getCapabilities(graph).find(c => normalize(c.label).includes(n) || n.includes(normalize(c.label)));
}
