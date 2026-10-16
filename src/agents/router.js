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

const SCHEDULE_RE = /^((?:每天|每日|每晚|每早|每周[一二三四五六日天]?|每月|今天|明天|后天|今晚|明早|明晚)?(?:早上|晚上|中午|下午|上午|睡前|饭后|饭前|早晚)?\s*(?:\d{1,2}\s*[点:：]\s*(?:\d{1,2}\s*分?|半)?)?)/;
const REPEAT_WORDS = [['daily', /每天|每日/], ['weekly', /每周/], ['monthly', /每月/]];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const memberNames = (graph) => getMembers(graph).map(m => m.name).sort((a, b) => b.length - a.length);
const isEnabled = (graph, id) => graph.getEntity(id) && graph.getEntity(id).enabled !== false;

/** "给小明 整理书桌 10积分 每天" → { title, assignees, points, repeatType } */
export function parseTaskSpec(text, graph) {
  let rest = String(text || '');
  let points;
  rest = rest.replace(/(\d+)\s*(?:个)?(?:积分|分)/, (m, n) => { points = Number(n); return ' '; });
  const repeatType = REPEAT_WORDS.find(([, re]) => re.test(rest))?.[0] || 'once';
  REPEAT_WORDS.forEach(([, re]) => { rest = rest.replace(re, ' '); });
  const assignees = [];
  memberNames(graph).forEach(name => {
    if (!rest.includes(name)) return;
    assignees.push(name);
    rest = rest.replace(new RegExp(`(?:给|让|由)?${escapeRe(name)}(?:负责|来)?`, 'g'), ' ');
  });
  const title = rest.replace(/^[\s:：,，、]+|[\s,，、。]+$/g, '').replace(/\s+/g, ' ');
  return { title, assignees, points, repeatType };
}

/** "爸爸每晚9点测血压" → { member, schedule, title } */
export function parseReminderSpec(text, graph) {
  let rest = String(text || '').trim();
  let member;
  const who = [...memberNames(graph), '全家', '大家'].find(n => rest.startsWith(n));
  if (who) {
    member = ['全家', '大家'].includes(who) ? undefined : who;
    rest = rest.slice(who.length);
  }
  rest = rest.replace(/^[\s:：,，]+/, '');
  const schedule = rest.match(SCHEDULE_RE)?.[1].trim() || '';
  const title = rest.slice(schedule ? rest.indexOf(schedule) + schedule.length : 0)
    .replace(/^[\s,，]*(?:要|记得|按时|去|该)?/, '').replace(/[\s,，。！!]+$/, '').trim();
  return { member, schedule, title: title || rest };
}

/** Commands for the task / health agents that should bypass profile extraction. */
export function parseAgentCommand(text, graph) {
  const t = text.trim();
  let m = t.match(/^(?:请)?(?:帮我)?(?:添加|新增|创建|安排|布置)(?:一个|一项)?(?:新的?)?(?:家庭)?任务\s*[:：]?\s*(.+)$/);
  if (m && isEnabled(graph, 'add_task')) return { capabilityId: 'add_task', args: parseTaskSpec(m[1], graph) };
  m = t.match(/^(?:请)?(?:帮我)?(?:添加|新增|设置|设)(?:一个|一条)?(?:健康)?提醒\s*[:：]?\s*(.+)$/)
    || t.match(new RegExp(`^(?:请)?(?:帮我)?提醒\\s*((?:${[...memberNames(graph), '全家', '大家'].map(escapeRe).join('|')}).+)$`));
  if (m && isEnabled(graph, 'add_health_reminder')) return { capabilityId: 'add_health_reminder', args: parseReminderSpec(m[1], graph) };
  if (/完成|做完|打卡|搞定/.test(t) && isEnabled(graph, 'complete_task')) {
    const task = graph.findEntities('Task').find(x => t.includes(x.title));
    if (task) return { capabilityId: 'complete_task', args: { task: task.title } };
  }
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
    case 'list_trips':
    case 'trip_checklist':
      return { trip: text };
    case 'health_overview':
    case 'health_reminders':
    case 'list_tasks':
      return { member: mentionedMember(text, graph) };
    case 'complete_task':
      return { task: text };
    case 'add_task':
      return parseTaskSpec(text.replace(/^.*?任务\s*[:：]?/, ''), graph);
    case 'add_health_reminder':
      return parseReminderSpec(text.replace(/^.*?提醒\s*[:：]?/, ''), graph);
    default:
      return { input: text };
  }
}

/**
 * Local intent router: maps the user's utterance onto one or more Capability
 * entities using agent commands, the profile extractor and each capability's keywords.
 */
export function routeLocally(text, graph) {
  const command = parseCapabilityCommand(text);
  if (command) return [{ capabilityId: 'manage_capabilities', args: command }];
  const agentCommand = parseAgentCommand(text, graph);
  if (agentCommand) return [agentCommand];

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
