/**
 * Built-in capabilities of the travel, health and task agents. Trips, tasks
 * and health reminders are ontology entities (Trip / Task / HealthReminder)
 * linked to FamilyMember entities through relations (Task -assignedTo->,
 * HealthReminder -reminderFor->); trip checklist items / wishes hold member
 * entity ids. Member names are always resolved from the graph at read time.
 */
import {
  findMember, getMembers, getFamilyProfiles, getCapabilityAgent, describeFamily, newId,
  memberNameOf, relatedMembers, memberNames, upsertMember, setMemberAttribute,
} from '../ontology/queries.js';
import { getAgentConfig, consultAgent } from './agentConfig.js';
import { FLIGGY_TYPES } from './fliggyRequest.js';
import { resolveFliggyTurn } from './fliggyContext.js';
import { travelCriteriaText, travelDetailLines } from './fliggyPresentation.js';

const asArray = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const asText = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

export const TRIP_STATUS = {
  planning:  { label: '规划中', className: 'status-planning' },
  wishlist:  { label: '心愿单', className: 'status-wishlist' },
  idea:      { label: '想法',   className: 'status-idea' },
  confirmed: { label: '已确认', className: 'status-confirmed' },
};

export const REPEAT_LABEL = { once: '一次性', daily: '每天', weekly: '每周', monthly: '每月' };

/* ---------- trips ---------- */
export const getTrips = (graph) => graph.findEntities('Trip');

export function findTrip(graph, text) {
  const t = asText(text);
  if (!t) return undefined;
  return getTrips(graph).find(trip => {
    const dest = asText(trip.destination);
    const tokens = [trip.title, trip.titleEn, dest, ...(dest.length > 2 ? [dest.slice(0, 2), dest.slice(-2)] : [])].map(asText);
    return tokens.some(token => token.length >= 2 && (t.includes(token) || (t.length >= 2 && token.includes(t))));
  });
}

export const tripProgress = (trip) => {
  const list = trip.checklist || [];
  return { done: list.filter(c => c.done).length, total: list.length };
};

export function toggleTripItem(graph, tripId, itemId) {
  const trip = graph.getEntity(tripId);
  if (!trip) return;
  graph.updateEntity(tripId, { checklist: (trip.checklist || []).map(c => (c.id === itemId ? { ...c, done: !c.done } : c)) });
}

function describeTrips(graph) {
  const trips = getTrips(graph);
  if (!trips.length) return '';
  return `## 家庭旅行计划\n${trips.map(t => {
    const p = tripProgress(t);
    const pending = (t.checklist || []).filter(c => !c.done).map(c => c.item).join('、');
    return `- ${t.title}（${t.destination}，${t.plannedMonth}，预算¥${t.budget}，${TRIP_STATUS[t.status]?.label || t.status}，准备 ${p.done}/${p.total}${pending ? `，待办：${pending}` : ''}）`;
  }).join('\n')}`;
}

function listTrips(args, { graph }) {
  const focus = findTrip(graph, args.trip);
  const trips = focus ? [focus] : getTrips(graph);
  if (!trips.length) return { reply: '还没有旅行计划。', views: [] };
  return {
    reply: `✈️ 家庭旅行计划：\n${trips.map(t => {
      const p = tripProgress(t);
      return `${t.coverEmoji || '🧳'} ${t.title}｜${t.plannedMonth}｜预算 ¥${t.budget}｜${TRIP_STATUS[t.status]?.label || t.status}｜准备 ${p.done}/${p.total}`;
    }).join('\n')}`,
    views: [{ type: 'trips', title: focus ? focus.title : '家庭旅行计划', args: { tripId: focus?.id } }],
  };
}

async function fliggyTravelSearch(args, { text, history = [] }) {
  const query = asText(args.query) || asText(text)
    .replace(/^(?:请)?(?:帮我|帮忙)?\s*/, '')
    .replace(/^(?:在|去|通过|用)?飞猪(?:上|旅行|开放平台)?\s*/i, '')
    .replace(/^(?:搜索|查一下|找一下|查查|查询|看看|搜|找)\s*/, '')
    .replace(/[？?。！!]+$/, '')
    .trim();

  if (!query) {
    return { reply: '想在飞猪查询什么呢？例如“在飞猪查三亚亲子酒店”或“西湖附近有什么景点门票”。', views: [] };
  }

  const { request, context, notice } = resolveFliggyTurn({ ...args, query }, history);
  if (request.error) return { reply: request.error, views: [], fliggyContext: context };
  const endpoint = '/api/fliggy/search';
  try {
    const res = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { reply: `❌ 飞猪接口查询失败：${err.error || res.statusText}`, views: [], fliggyContext: context };
    }
    const data = await res.json();
    if (data.clarification) return { reply: data.clarification, views: [], fliggyContext: context };
    const items = data.items || [];
    if (!items.length) {
      return { reply: `🕊️ 飞猪 AI 开放平台未找到与「${query}」相关的旅行商品。`, views: [], fliggyContext: context };
    }

    const criteria = data.criteria || request;
    const criteriaText = travelCriteriaText(criteria);
    const lines = items.slice(0, 5).map(it => {
      const priceStr = it.price ? ` · 展示价 **${it.price}**` : ' · 价格未返回';
      const details = travelDetailLines(it);
      return `• ${it.jumpUrl ? `[${it.title}](${it.jumpUrl})` : it.title}${priceStr}${details.length ? `\n  ${details.join('\n  ')}` : ''}`;
    });

    return {
      fliggyContext: context,
      reply: `${notice ? `${notice}\n\n` : ''}🕊️ **飞猪 AI 开放平台实时搜索 · ${FLIGGY_TYPES[data.type || request.type]}**（关键词：${query}）：\n\n${criteriaText ? `${criteriaText}\n\n` : ''}${lines.join('\n\n')}\n\n*时间按飞猪接口原文展示（机场/车站当地时间，未做时区换算）。以上为查询时展示价，不保证库存或最终结算价；请在飞猪核对日期、房型/舱位及退改条件，未自动预订。*`,
      views: [{ type: 'fliggy_travel', title: `飞猪旅行 · ${query}`, args: { query, items, criteria, observedAt: data.observedAt } }],
    };
  } catch (err) {
    return { reply: `❌ 连接飞猪接口超时或出错：${err.message}`, views: [], fliggyContext: context };
  }
}

function tripChecklist(args, { graph }) {
  const trips = getTrips(graph);
  const trip = findTrip(graph, args.trip) || trips.find(t => t.status === 'planning') || trips[0];
  if (!trip) return { reply: '还没有旅行计划。', views: [] };
  const pending = (trip.checklist || []).filter(c => !c.done);
  const wishes = (trip.wishes || []).map(w => `${memberNameOf(graph, w.memberId) || '家人'}：${w.content}`);
  return {
    reply: `🧳 ${trip.title} 行前清单：${pending.length ? `还有 ${pending.length} 项未完成\n${pending.map(c => { const who = memberNameOf(graph, c.memberId); return `☐ ${c.item}${who ? `（${who}）` : ''}`; }).join('\n')}` : '全部准备好啦 🎉'}${wishes.length ? `\n\n💭 心愿：\n${wishes.join('\n')}` : ''}`,
    views: [{ type: 'trips', title: `${trip.title} · 行前清单`, args: { tripId: trip.id } }],
  };
}

/* ---------- health ---------- */
const METRIC_UNITS = { 血压: 'mmHg', 血糖: 'mmol/L', 体重: 'kg', 体温: '℃', 心率: 'bpm', 用药: '次' };

/** FamilyMember entities a reminder is for (empty = whole family). */
export const reminderMembers = (graph, reminder) => relatedMembers(graph, reminder.id, 'reminderFor');

export const getReminders = (graph) => graph.findEntities('HealthReminder')
  .sort((a, b) => Number(a.done) - Number(b.done) || (a.layer === 'user' ? -1 : 0) - (b.layer === 'user' ? -1 : 0));

export function toggleReminder(graph, id) {
  const r = graph.getEntity(id);
  if (r) graph.updateEntity(id, { done: !r.done });
}

export function getHealthRecords(graph, { memberId, metric } = {}) {
  return graph.findEntities('HealthRecord')
    .filter(rec => {
      const owners = graph.objects(rec.id, 'recordFor');
      if (memberId && !owners.includes(memberId)) return false;
      if (metric && rec.metric !== metric) return false;
      return true;
    })
    .sort((a, b) => String(b.recordedAt || '').localeCompare(String(a.recordedAt || '')));
}

export function logHealthRecord(args, { graph }) {
  const memberName = asText(args.member) || '爸爸';
  const { member } = upsertMember(graph, memberName);
  const metric = asText(args.metric) || '血压';
  const value = asText(args.value);
  if (!value) return { reply: '请提供具体的监测数值或用药名称，例如“记录爸爸今天血压135/85”。', views: [] };
  const unit = asText(args.unit) || METRIC_UNITS[metric] || '';
  const note = asText(args.note);
  const record = graph.batch(() => {
    const entity = graph.addEntity({
      id: newId('hrec'),
      type: 'HealthRecord',
      metric,
      value,
      unit,
      note,
      recordedAt: new Date().toISOString(),
    });
    graph.addTriple(entity.id, 'recordFor', member.id);
    if (['血压', '血糖', '体重'].includes(metric)) {
      setMemberAttribute(graph, member.id, metric, `${value}${unit ? ` ${unit}` : ''}`);
    }
    return entity;
  });
  return {
    reply: `🩺 已记录 ${member.avatar} ${member.name} 的${record.metric}：${record.value}${record.unit ? ` ${record.unit}` : ''}${record.note ? `（${record.note}）` : ''}`,
    views: [{ type: 'health_records', title: `${member.name}的健康监测账本`, args: { memberId: member.id } }],
  };
}

export function queryHealthRecords(args, { graph }) {
  const name = asText(args.member);
  const member = name && findMember(graph, name);
  const metric = asText(args.metric) || undefined;
  const records = getHealthRecords(graph, { memberId: member?.id, metric });
  if (!records.length) {
    return {
      reply: `📒 暂无${member ? member.name : '家庭'}${metric || '健康监测'}记录，可以说“记录爸爸今天血压135/85”来添加。`,
      views: [{ type: 'health_records', title: '健康监测账本', args: { memberId: member?.id, metric } }],
    };
  }
  const lines = records.slice(0, 6).map(r => {
    const who = memberNames(relatedMembers(graph, r.id, 'recordFor'));
    const date = r.recordedAt ? new Date(r.recordedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return `• ${who}｜${r.metric}：${r.value}${r.unit ? ` ${r.unit}` : ''}${r.note ? `（${r.note}）` : ''}${date ? ` · ${date}` : ''}`;
  });
  return {
    reply: `📒 ${member ? `${member.name}的` : '家庭'}健康监测账本（共 ${records.length} 条）：\n${lines.join('\n')}`,
    views: [{ type: 'health_records', title: member ? `${member.name}的健康监测账本` : '健康监测账本', args: { memberId: member?.id, metric } }],
  };
}

function describeReminders(graph) {
  const list = getReminders(graph).filter(r => !r.done);
  return list.length ? `## 健康提醒\n${list.map(r => `- ${memberNames(reminderMembers(graph, r))}：${r.title}（${r.schedule}）`).join('\n')}` : '';
}

function healthOverview(args, { graph }) {
  const member = asText(args.member) && findMember(graph, asText(args.member));
  const profiles = getFamilyProfiles(graph).filter(p => !member || p.member.id === member.id);
  if (!profiles.length) return { reply: '还没有家庭成员档案，告诉我“爸爸有高血压”即可建档。', views: [] };
  const lines = profiles.map(p => {
    const items = [
      ...p.conditions.map(c => `${c.label}${c.advice ? `（${c.advice}）` : ''}`),
      ...p.allergens.map(a => `对${a.label}过敏`),
    ];
    return `${p.member.avatar} ${p.member.name}：${items.join('；') || '暂无特别健康状况'}`;
  });
  return {
    reply: `💗 家庭健康概览：\n${lines.join('\n')}\n\n健康建议仅供参考，不能替代医生意见。`,
    views: [{ type: 'health', title: member ? `${member.name}的健康概览` : '家庭健康概览', args: { memberIds: member ? [member.id] : undefined } }],
  };
}

function healthReminders(args, { graph }) {
  const name = asText(args.member);
  const member = name && findMember(graph, name);
  const list = getReminders(graph).filter(r => {
    const owners = reminderMembers(graph, r);
    return !name || !owners.length || owners.some(o => o.id === member?.id);
  });
  if (!list.length) return { reply: '暂时没有健康提醒，可以说“提醒爸爸每晚9点测血压”。', views: [] };
  return {
    reply: `⏰ 健康提醒：\n${list.map(r => `${r.done ? '✅' : '⬜'} ${r.emoji} ${memberNames(reminderMembers(graph, r))}：${r.title}（${r.schedule}）`).join('\n')}`,
    views: [{ type: 'reminders', title: '健康提醒' }],
  };
}

const REMINDER_KINDS = [
  [/药/, '💊', '用药'], [/血压|血糖|测量|心率|体温/, '🩺', '监测'], [/疫苗|接种/, '💉', '疫苗'],
  [/体检|检查|复查|牙/, '🏥', '体检'], [/运动|散步|跑步|锻炼|跳绳/, '🏃', '运动'], [/喝水|饮水/, '💧', '饮水'], [/睡|午休/, '😴', '作息'],
];

function addHealthReminder(args, { graph }) {
  const title = asText(args.title);
  if (!title) return { reply: '请告诉我提醒内容，例如“提醒爸爸每晚9点测血压”。', views: [] };
  const name = asText(args.member);
  const member = name && findMember(graph, name);
  const [, emoji, category] = REMINDER_KINDS.find(([re]) => re.test(title)) || [null, '⏰', '其他'];
  const reminder = graph.batch(() => {
    const entity = graph.addEntity({
      id: newId('reminder'), type: 'HealthReminder', title, emoji, category,
      schedule: asText(args.schedule) || '待定', done: false,
    });
    if (member) graph.addTriple(entity.id, 'reminderFor', member.id);
    return entity;
  });
  return {
    reply: `⏰ 已新增健康提醒：${reminder.emoji} ${member ? member.name : '全家'}·${reminder.title}（${reminder.schedule}）`,
    views: [{ type: 'reminders', title: '健康提醒' }],
  };
}

/* ---------- tasks ---------- */
export const getTasks = (graph) => graph.findEntities('Task')
  .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.layer === 'user' ? -1 : 0) - (b.layer === 'user' ? -1 : 0));

/** FamilyMember entities a task is assigned to (empty = whole family). */
export const taskAssignees = (graph, task) => relatedMembers(graph, task.id, 'assignedTo');

/** TaskLog entities recorded in the graph, newest first. */
export const getTaskLogs = (graph, { taskId, memberId } = {}) =>
  graph.findEntities('TaskLog')
    .filter(log => {
      if (taskId && !graph.objects(log.id, 'logOfTask').includes(taskId)) return false;
      if (memberId && !graph.objects(log.id, 'completedBy').includes(memberId)) return false;
      return true;
    })
    .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));

/**
 * Points earned per member from TaskLog occurrences plus any legacy / base
 * completed tasks that do not yet have a TaskLog entry.
 */
export function taskScores(graph) {
  const loggedTaskIds = new Set(
    graph.findEntities('TaskLog').flatMap(log => graph.objects(log.id, 'logOfTask')),
  );
  return getMembers(graph)
    .map(m => {
      const logPoints = getTaskLogs(graph, { memberId: m.id })
        .reduce((sum, log) => sum + (Number(log.points) || 0), 0);
      const basePoints = graph.subjects('assignedTo', m.id)
        .filter(tid => !loggedTaskIds.has(tid))
        .map(id => graph.getEntity(id))
        .filter(t => t?.completed)
        .reduce((sum, t) => sum + (Number(t.points) || 0), 0);
      return { id: m.id, name: m.name, points: logPoints + basePoints };
    })
    .sort((a, b) => b.points - a.points);
}

export function toggleTask(graph, id, performerId) {
  const t = graph.getEntity(id);
  if (!t) return;
  const nextCompleted = !t.completed;
  graph.batch(() => {
    graph.updateEntity(id, { completed: nextCompleted });
    if (nextCompleted) {
      const assignees = taskAssignees(graph, t);
      const actors = performerId ? [graph.getEntity(performerId)].filter(Boolean) : assignees;
      const log = graph.addEntity({
        id: newId('tlog'),
        type: 'TaskLog',
        points: Number(t.points) || 0,
        completedAt: new Date().toISOString(),
      });
      graph.addTriple(log.id, 'logOfTask', t.id);
      actors.forEach(a => graph.addTriple(log.id, 'completedBy', a.id));
    } else {
      graph.subjects('logOfTask', t.id)
        .map(lid => graph.getEntity(lid))
        .filter(l => l?.layer === 'user')
        .forEach(l => graph.removeEntity(l.id));
    }
  });
}

function describeTasks(graph) {
  const tasks = getTasks(graph);
  return tasks.length
    ? `## 家庭任务\n${tasks.map(t => `- ${t.completed ? '[x]' : '[ ]'} ${t.title}（${memberNames(taskAssignees(graph, t))}，${REPEAT_LABEL[t.repeatType] || ''}，${t.points}积分）`).join('\n')}`
    : '';
}

function listTasks(args, { graph }) {
  const name = asText(args.member);
  const member = name && findMember(graph, name);
  const tasks = getTasks(graph).filter(t => !name || taskAssignees(graph, t).some(m => m.id === member?.id));
  if (!tasks.length) return { reply: '暂时没有家庭任务，可以说“添加任务 给小明 整理书桌 10积分”。', views: [] };
  const pending = tasks.filter(t => !t.completed);
  const top = taskScores(graph).filter(s => s.points > 0).slice(0, 3);
  return {
    reply: `✅ 家庭任务：已完成 ${tasks.length - pending.length}/${tasks.length}\n${pending.slice(0, 8).map(t => `⬜ ${t.emoji || '📝'} ${t.title}（${memberNames(taskAssignees(graph, t))}，${t.points}积分）`).join('\n')}${top.length ? `\n\n🏆 积分：${top.map(s => `${s.name} ${s.points}`).join('，')}` : ''}`,
    views: [{ type: 'tasks', title: name ? `${name}的任务` : '家庭任务' }],
  };
}

function addTask(args, { graph }) {
  const title = asText(args.title);
  if (!title) return { reply: '请告诉我任务内容，例如“添加任务 给小明 整理书桌 10积分”。', views: [] };
  const names = asArray(args.assignees).map(asText).filter(Boolean);
  const assignees = [...new Set(names.map(n => findMember(graph, n)).filter(Boolean))];
  const unknown = names.filter(n => !findMember(graph, n));
  const points = Number(args.points);
  const repeatType = REPEAT_LABEL[args.repeatType] ? args.repeatType : 'once';
  const task = graph.batch(() => {
    const entity = graph.addEntity({
      id: newId('task'), type: 'Task', title, emoji: '📝', category: '其他', repeatType,
      points: Number.isFinite(points) && points >= 0 ? Math.round(points) : 10, completed: false, dueTime: '',
    });
    assignees.forEach(m => graph.addTriple(entity.id, 'assignedTo', m.id));
    return entity;
  });
  return {
    reply: `📝 已新增任务「${task.title}」，负责人：${memberNames(assignees)}，${REPEAT_LABEL[repeatType]}，${task.points} 积分。${unknown.length ? `\n（家庭档案中没有「${unknown.join('、')}」，未分配给他们，可先在对话中建档）` : ''}`,
    views: [{ type: 'tasks', title: '家庭任务' }],
  };
}

function completeTask(args, { graph, text }) {
  const query = asText(args.task) || asText(text);
  const tasks = getTasks(graph);
  const task = tasks.find(t => query.includes(t.title)) || tasks.find(t => query && t.title.includes(query));
  if (!task) return { reply: `没有找到任务「${query}」。可以说“今天有哪些家庭任务”查看列表。`, views: [] };
  const actorName = asText(args.member);
  const actor = (actorName && findMember(graph, actorName))
    || getMembers(graph).find(m => asText(text).includes(m.name));
  const assignees = taskAssignees(graph, task);
  const performers = actor ? [actor] : assignees;
  if (task.completed && task.repeatType === 'once') {
    return { reply: `「${task.title}」已经完成过啦 👍`, views: [{ type: 'tasks', title: '家庭任务' }] };
  }
  graph.batch(() => {
    graph.updateEntity(task.id, { completed: true });
    const log = graph.addEntity({
      id: newId('tlog'),
      type: 'TaskLog',
      points: Number(task.points) || 0,
      completedAt: new Date().toISOString(),
    });
    graph.addTriple(log.id, 'logOfTask', task.id);
    performers.forEach(p => graph.addTriple(log.id, 'completedBy', p.id));
  });
  return {
    reply: `🎉 「${task.title}」已打卡完成！${memberNames(performers)} +${task.points} 积分`,
    views: [{ type: 'tasks', title: '家庭任务' }],
  };
}

/* ---------- consult (uses the agent configuration) ---------- */
const DOMAIN_CONTEXT = { agent_travel: describeTrips, agent_health: describeReminders, agent_task: describeTasks };

/** Domain data passed to the AI together with the agent configuration. */
export function agentDomainContext(graph, agentId) {
  return [
    `## 家庭成员\n${describeFamily(graph) || '（暂无）'}`,
    DOMAIN_CONTEXT[agentId]?.(graph) || '',
    `今天是 ${new Date().toLocaleDateString('zh-CN')}。`,
  ].filter(Boolean).join('\n\n');
}

async function agentConsult(args, { graph, text, capability }) {
  const agent = capability && getCapabilityAgent(graph, capability);
  if (!agent) return { reply: '没有找到对应的 Agent。', views: [] };
  const question = asText(args.input) || asText(text);
  const { reply } = await consultAgent(getAgentConfig(graph, agent), question, { context: agentDomainContext(graph, agent.id) });
  return { reply, views: [{ type: 'text', title: `${agent.emoji} ${capability.label}`, data: { text: reply } }] };
}

export const FAMILY_HANDLERS = {
  fliggy_travel_search: fliggyTravelSearch,
  list_trips: listTrips,
  trip_checklist: tripChecklist,
  health_overview: healthOverview,
  health_reminders: healthReminders,
  add_health_reminder: addHealthReminder,
  log_health_record: logHealthRecord,
  query_health_records: queryHealthRecords,
  list_tasks: listTasks,
  add_task: addTask,
  complete_task: completeTask,
  agent_consult: agentConsult,
};
