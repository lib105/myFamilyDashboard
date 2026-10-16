import { extractProfileUpdates } from './profileExtractor.js';
import { getCapabilities, getMembers, findIngredientsInText } from '../ontology/queries.js';

const CATEGORY_WORDS = [
  ['fruit', /水果|果子/], ['vegetable', /蔬菜|青菜|菜蔬/], ['protein', /肉|蛋白|蛋奶|豆制品/],
  ['grain', /粗粮|主食|谷物|杂粮/], ['mushroom', /菌|菇/], ['nut', /坚果|干果/],
];
const MEAL_WORDS = [
  ['早餐', /早餐|早饭|早上/], ['午餐', /午餐|午饭|中午/], ['晚餐', /晚餐|晚饭|晚上|今晚/], ['加餐', /加餐|零食|下午茶|点心/],
];
const CN_NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };
const FIELD_NAMES = '名称|名字|关键词|触发词|回复|提示词|Agent|agent|智能体';
const FIELD_RE = new RegExp(`(${FIELD_NAMES})\\s*[:：=]\\s*([\\s\\S]*?)(?=\\s+(?:${FIELD_NAMES})\\s*[:：=]|$)`, 'g');

function mentionedMember(text, graph) {
  return getMembers(graph)
    .map(m => ({ m, idx: text.indexOf(m.name) }))
    .filter(x => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx)[0]?.m.name;
}

function orderItems(text, graph) {
  return findIngredientsInText(graph, text).map(({ ingredient, index }) => {
    const before = text.slice(Math.max(0, index - 6), index);
    const m = before.match(/(\d+(?:\.\d+)?|[一两二三四五六七八九十半])\s*(?:斤|个|盒|份|袋|瓶|公斤|kg|只|把|颗|根|箱|盒子)?\s*$/);
    const quantity = m ? (CN_NUM[m[1]] ?? Number(m[1])) : 1;
    return { name: ingredient.label, quantity };
  });
}

export function parseCapabilityCommand(text) {
  const t = text.trim();
  if (/^(请)?(帮我)?(添加|新增|增加|注册|创建)(一个|一项)?(新)?能力/.test(t)) {
    const fields = {};
    for (const [, key, value] of t.matchAll(FIELD_RE)) fields[key.toLowerCase()] = value.trim();
    return {
      action: 'add',
      name: fields['名称'] || fields['名字'],
      keywords: (fields['关键词'] || fields['触发词'] || '').split(/[,，、\s]+/).filter(Boolean),
      reply: fields['回复'],
      prompt: fields['提示词'],
      agent: fields.agent || fields['智能体'],
    };
  }
  const m = t.match(/^(请)?(帮我)?(禁用|停用|关闭|启用|开启|打开|删除|移除)(一下)?能力\s*[:：「"]?\s*([^」"]+)/);
  if (m) {
    const verb = m[3];
    const action = /禁用|停用|关闭/.test(verb) ? 'disable' : /启用|开启|打开/.test(verb) ? 'enable' : 'remove';
    return { action, name: m[5].trim() };
  }
  if (/你能做什么|你会什么|有哪些能力|能力列表|能力清单|功能列表|列出能力|查看能力/.test(t)) return { action: 'list' };
  return null;
}

/** Extracts arguments for a capability from free text (local mode). */
export function extractArgs(capability, text, graph) {
  switch (capability.handler) {
    case 'recommend_produce':
      return { category: CATEGORY_WORDS.find(([, re]) => re.test(text))?.[0] || 'all', member: mentionedMember(text, graph) };
    case 'recommend_recipes':
      return { mealType: MEAL_WORDS.find(([, re]) => re.test(text))?.[0], member: mentionedMember(text, graph) };
    case 'collect_ingredient_data': {
      const found = findIngredientsInText(graph, text).map(f => f.ingredient.label);
      if (found.length) return { items: found };
      const m = text.match(/(?:介绍(?:一下)?|采集|了解(?:一下)?|查(?:一下)?)\s*([^\s，。,？?的]{1,8})/);
      return { items: m ? [m[1]] : [] };
    }
    case 'query_supermarket_price':
    case 'query_app_discounts':
      return { items: findIngredientsInText(graph, text).map(f => f.ingredient.label) };
    case 'place_order':
      return { items: orderItems(text, graph) };
    default:
      return { input: text };
  }
}

/**
 * Local intent router: maps the user's utterance onto one or more Capability
 * entities using the profile extractor and each capability's keywords.
 */
export function routeLocally(text, graph) {
  const command = parseCapabilityCommand(text);
  if (command) return [{ capabilityId: 'manage_capabilities', args: command }];

  const calls = [];
  const updates = extractProfileUpdates(text, graph);
  if (updates.length) calls.push({ capabilityId: 'update_member_profile', args: { updates } });

  const scored = getCapabilities(graph, { enabledOnly: true })
    .filter(c => !['update_member_profile', 'manage_capabilities'].includes(c.id))
    .map(c => ({ c, score: (c.keywords || []).filter(k => k && text.includes(k)).length }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.c.priority || 0) - (a.c.priority || 0))
    .slice(0, 2);
  scored.forEach(({ c }) => calls.push({ capabilityId: c.id, args: extractArgs(c, text, graph) }));
  return calls;
}
