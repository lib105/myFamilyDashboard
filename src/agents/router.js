import { extractProfileUpdates } from './profileExtractor.js';
import { getCapabilities, getMembers, findIngredientsInText } from '../ontology/queries.js';
import { findTrip } from './familyAgents.js';

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

function recommendationMember(text, graph) {
  if (/全家|大家/.test(text)) return undefined;
  return getMembers(graph).find(m => ['给', '为', '针对'].some(prefix => text.includes(`${prefix}${m.name}`)))?.name
    || mentionedMember(text, graph);
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

/** Extract a JD product query without discarding brand/model/pack-size text. */
export function parseJDProductQuery(text, graph) {
  let query = String(text).trim().replace(/^(?:请)?(?:帮我|帮忙)?\s*/, '');
  for (const name of memberNames(graph)) {
    query = query.replace(new RegExp(`^(?:帮|给|为)${escapeRe(name)}\\s*`), '');
  }
  query = query
    .replace(/^(?:搜索|搜一下|查一下|查找|查询|看看|找|搜)\s*/, '')
    .replace(/^(?:在|去|到|用)?\s*(?:京东|jd(?:\.com)?)(?:网站|商城|上)?\s*/i, '')
    .replace(/^(?:帮我)?(?:搜索|搜一下|查一下|查找|查询|看看|找一下|找个|找|搜|查|买|购买)\s*/, '')
    .replace(/[，,]\s*(?:看看|查看|查询|查查)?(?:价格|价钱|优惠|折扣|打折|促销).*$/, '')
    .replace(/(?:的价格和优惠|价格和打折信息|价格和优惠|有什么打折信息|有哪些优惠|有什么优惠|有什么促销|的价格|的优惠|多少钱)\s*[？?。！!]*$/, '')
    .replace(/\s+(?:优惠|价格|折扣|打折信息)\s*[？?。！!]*$/, '')
    .replace(/[？?。！!]+$/, '').trim();
  return query;
}

/** Commands for browser / task / health / pantry agents bypass profile extraction. */
export function parseAgentCommand(text, graph) {
  const t = text.trim();
  if (!/^(?:请)?(?:隐藏|显示|置顶|收起|关闭|打开|恢复)/.test(t)
    && /飞猪|酒店|住宿|订房|民宿|机票|航班|门票|火车票|高铁|动车/.test(t)
    && graph.getEntity('fliggy_travel_search')?.type === 'Capability') {
    return { capabilityId: 'fliggy_travel_search', args: { query: t } };
  }
  if (/(?:京东|\bjd(?:\.com)?\b)/i.test(t) && graph.getEntity('search_products_with_browser')?.type === 'Capability'
    && !/^(?:请)?(?:隐藏|显示|置顶|收起|关闭|打开|恢复)/.test(t)) {
    return { capabilityId: 'search_products_with_browser', args: { query: parseJDProductQuery(t, graph), site: 'site_jd' } };
  }
  if (/(?:沃尔玛|比优特|华润万家)/.test(t) && isEnabled(graph, 'query_supermarket_price')) {
    let items = findIngredientsInText(graph, t).map(f => f.ingredient.label);
    if (!items.length) {
      // Extract target item between store keywords and query words
      let raw = t.replace(/(?:对比|比较|查看)?(?:沃尔玛|比优特|华润万家|和|与|的|买|查|超市)+/g, ' ')
                 .replace(/(?:哪个划算|哪家便宜|哪个便宜|哪家划算|多少钱|价格|比价|怎么样|怎样)/g, '')
                 .trim();
      if (raw) items = [raw];
    }
    return { capabilityId: 'query_supermarket_price', args: { items } };
  }
  let m = t.match(/^(?:请)?(?:帮我)?(?:添加|新增|创建|安排|布置)(?:一个|一项)?(?:新的?)?(?:家庭)?任务\s*[:：]?\s*(.+)$/);
  if (m && isEnabled(graph, 'add_task')) return { capabilityId: 'add_task', args: parseTaskSpec(m[1], graph) };
  m = t.match(/^(?:请)?(?:帮我)?(?:添加|新增|设置|设)(?:一个|一条)?(?:健康)?提醒\s*[:：]?\s*(.+)$/)
    || t.match(new RegExp(`^(?:请)?(?:帮我)?提醒\\s*((?:${[...memberNames(graph), '全家', '大家'].map(escapeRe).join('|')}).+)$`));
  if (m && isEnabled(graph, 'add_health_reminder')) return { capabilityId: 'add_health_reminder', args: parseReminderSpec(m[1], graph) };
  if (/完成|做完|打卡|搞定/.test(t) && isEnabled(graph, 'complete_task')) {
    const task = graph.findEntities('Task').find(x => t.includes(x.title));
    if (task) return { capabilityId: 'complete_task', args: { task: task.title, member: mentionedMember(t, graph) } };
  }
  const hrec = parseHealthRecordCommand(t, graph);
  if (hrec && isEnabled(graph, 'log_health_record')) return { capabilityId: 'log_health_record', args: hrec };
  if (/(?:查看|看看|查一下)?.*(?:血压|血糖|体重|健康|监测|吃药|服药).*记录|趋势/.test(t) && isEnabled(graph, 'query_health_records')) {
    const metric = ['血压', '血糖', '体重', '体温', '心率', '用药'].find(k => t.includes(k));
    return { capabilityId: 'query_health_records', args: { member: mentionedMember(t, graph), metric } };
  }
  if (/缺什么|还差什么|差哪些食材|补货|照着食谱买|买齐/.test(t) && !/清单|行李|大阪|三亚/.test(t) && isEnabled(graph, 'smart_restock_for_recipes')) {
    const recipe = graph.findEntities('Recipe').find(r => t.includes(r.label) || t.includes(r.label.replace(/（.*）/, '')));
    const mealType = MEAL_WORDS.find(([, re]) => re.test(t))?.[0];
    const autoOrder = /下单|买齐|帮我买|生成订单/.test(t);
    return { capabilityId: 'smart_restock_for_recipes', args: { recipe: recipe?.label, mealType, autoOrder } };
  }
  if (/冰箱|库存|储物柜|家里还有|用掉了|消耗了/.test(t) && isEnabled(graph, 'manage_pantry')) {
    const items = orderItems(t, graph);
    const action = /用掉|消耗|吃了|用完/.test(t) ? 'consume' : items.length ? 'set' : 'list';
    return { capabilityId: 'manage_pantry', args: { action, items } };
  }
  if (/(?:视频|教程|B站|bilibili|哔哩哔哩|必应视频|抖音|douyin)/i.test(t) && isEnabled(graph, 'search_video_with_browser')) {
    return { capabilityId: 'search_video_with_browser', args: extractArgs(graph.getEntity('search_video_with_browser'), t, graph) };
  }
  return null;
}

export function parseHealthRecordCommand(text, graph) {
  const t = String(text || '').trim();
  const member = mentionedMember(t, graph) || t.match(/^(爸爸|妈妈|爷爷|奶奶|外公|外婆|小明|小花)/)?.[1];
  if (!member) return null;
  // Blood pressure: e.g. "记录爸爸今天血压 135/85" or "爸爸测了血压130/80"
  let m = t.match(/(?:记录|测了?|量了?|今天|早上|晚上).*?血压\s*[:：为是]?\s*(\d{2,3}\s*[/／]\s*\d{2,3})(?:\s*(mmHg))?/i)
    || t.match(/^记录.*?血压\s*[:：为是]?\s*(\d{2,3}\s*[/／]\s*\d{2,3})/i);
  if (m) return { member, metric: '血压', value: m[1].replace(/\s+/g, ''), unit: 'mmHg' };
  // Blood glucose: e.g. "记录奶奶空腹血糖 6.2"
  m = t.match(/(?:记录|测了?|量了?|今天|空腹|餐后).*?血糖\s*[:：为是]?\s*(\d+(?:\.\d+)?)/i);
  if (m) return { member, metric: '血糖', value: m[1], unit: 'mmol/L', note: /空腹/.test(t) ? '空腹' : /餐后/.test(t) ? '餐后' : '' };
  // Medication check-in: e.g. "爸爸吃过降压药了"
  m = t.match(/(?:吃了|吃过|服用了|服过)\s*([^\s，。！!了]{2,10}?药)/);
  if (m) return { member, metric: '用药', value: m[1], unit: '次' };
  return null;
}

/** Extracts arguments for a capability from free text (local mode). */
export function extractArgs(capability, text, graph) {
  switch (capability.handler) {
    case 'recommend_produce':
      return { category: CATEGORY_WORDS.find(([, re]) => re.test(text))?.[0] || 'all', member: recommendationMember(text, graph) };
    case 'recommend_recipes':
      return { mealType: MEAL_WORDS.find(([, re]) => re.test(text))?.[0], member: recommendationMember(text, graph) };
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
    case 'search_products_with_browser':
      return { query: parseJDProductQuery(text, graph), site: 'site_jd' };
    case 'list_trips':
    case 'trip_checklist':
      return { trip: text };
    case 'health_overview':
    case 'health_reminders':
    case 'list_tasks':
      return { member: mentionedMember(text, graph) };
    case 'complete_task':
      return { task: text, member: mentionedMember(text, graph) };
    case 'log_health_record':
      return parseHealthRecordCommand(text, graph) || { member: mentionedMember(text, graph) || '爸爸', metric: '血压', value: '' };
    case 'query_health_records':
      return { member: mentionedMember(text, graph), metric: ['血压', '血糖', '体重', '体温', '心率', '用药'].find(k => text.includes(k)) };
    case 'manage_pantry': {
      const items = orderItems(text, graph);
      return { action: /用掉|消耗|吃了/.test(text) ? 'consume' : items.length ? 'set' : 'list', items };
    }
    case 'smart_restock_for_recipes': {
      const recipe = graph.findEntities('Recipe').find(r => text.includes(r.label));
      return {
        recipe: recipe?.label,
        mealType: MEAL_WORDS.find(([, re]) => re.test(text))?.[0],
        autoOrder: /下单|买齐|帮我买|生成订单/.test(text),
      };
    }
    case 'search_video_with_browser': {
      const site = graph.findEntities('BrowserSite').find(s =>
        text.toLowerCase().includes(s.label.toLowerCase())
        || (s.synonyms || []).some(syn => text.toLowerCase().includes(syn.toLowerCase())));
      let cleaned = String(text).trim();
      // Remove known member prefixes only; greedy \\S+ used to swallow the whole query.
      cleaned = cleaned.replace(/^(?:请)?(?:帮我|帮忙)?\s*/, '');
      for (const name of memberNames(graph)) {
        cleaned = cleaned.replace(new RegExp(`^(?:帮|给|为)?${escapeRe(name)}(?:找|搜)?\\s*`), '');
      }
      cleaned = cleaned
        .replace(/^(?:搜索|搜一下|找一下|查找|找个|找一个|找|看|搜)\s*/, '')
        .replace(/^(?:在|去|用|到)?\s*(?:B站|bilibili|哔哩哔哩|必应视频|必应|下厨房|抖音|douyin)(?:上)?(?:的)?\s*/i, '')
        .replace(/^(?:搜索|搜一下|找一下|查找|找个|找一个|找|看|搜)\s*/, '')
        .trim();
      return {
        query: cleaned || text,
        site: site?.id,
        member: mentionedMember(text, graph),
      };
    }
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
  if (updates.length && isEnabled(graph, 'update_member_profile')) calls.push({ capabilityId: 'update_member_profile', args: { updates } });

  const scored = getCapabilities(graph, { enabledOnly: true })
    .filter(c => !['update_member_profile', 'manage_capabilities'].includes(c.id))
    .map(c => ({ c, score: (c.keywords || []).filter(k => k && text.includes(k)).length }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.c.priority || 0) - (a.c.priority || 0))
    .slice(0, 2);
  scored.forEach(({ c }) => calls.push({ capabilityId: c.id, args: extractArgs(c, text, graph) }));
  // Open-ended questions about a known trip go to the travel agent.
  if (!calls.length && findTrip(graph, text) && isEnabled(graph, 'travel_consult')) {
    calls.push({ capabilityId: 'travel_consult', args: { input: text } });
  }
  return calls;
}
