/**
 * Built-in capabilities of the travel, health and task agents. Trips, tasks
 * and health reminders are ontology entities (Trip / Task / HealthReminder).
 */
import { findMember, getMembers, getFamilyProfiles, getCapabilityAgent, describeFamily, newId } from '../ontology/queries.js';
import { getAgentConfig, consultAgent } from './agentConfig.js';

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

function tripChecklist(args, { graph }) {
  const trips = getTrips(graph);
  const trip = findTrip(graph, args.trip) || trips.find(t => t.status === 'planning') || trips[0];
  if (!trip) return { reply: '还没有旅行计划。', views: [] };
  const pending = (trip.checklist || []).filter(c => !c.done);
  const wishes = (trip.wishes || []).map(w => `${w.member}：${w.content}`);
  return {
    reply: `🧳 ${trip.title} 行前清单：${pending.length ? `还有 ${pending.length} 项未完成\n${pending.map(c => `☐ ${c.item}${c.assignee ? `（${c.assignee}）` : ''}`).join('\n')}` : '全部准备好啦 🎉'}${wishes.length ? `\n\n💭 心愿：\n${wishes.join('\n')}` : ''}`,
    views: [{ type: 'trips', title: `${trip.title} · 行前清单`, args: { tripId: trip.id } }],
  };
}

/* ---------- health ---------- */
export const getReminders = (graph) => graph.findEntities('HealthReminder')
  .sort((a, b) => Number(a.done) - Number(b.done) || (a.layer === 'user' ? -1 : 0) - (b.layer === 'user' ? -1 : 0));

export function toggleReminder(graph, id) {
  const r = graph.getEntity(id);
  if (r) graph.updateEntity(id, { done: !r.done });
}

function describeReminders(graph) {
  const list = getReminders(graph).filter(r => !r.done);
  return list.length ? `## 健康提醒\n${list.map(r => `- ${r.member}：${r.title}（${r.schedule}）`).join('\n')}` : '';
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
  const list = getReminders(graph).filter(r => !name || r.member === name || r.member === '全家');
  if (!list.length) return { reply: '暂时没有健康提醒，可以说“提醒爸爸每晚9点测血压”。', views: [] };
  return {
    reply: `⏰ 健康提醒：\n${list.map(r => `${r.done ? '✅' : '⬜'} ${r.emoji} ${r.member}：${r.title}（${r.schedule}）`).join('\n')}`,
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
  const reminder = graph.addEntity({
    id: newId('reminder'), type: 'HealthReminder', title, emoji, category,
    member: member ? member.name : '全家', schedule: asText(args.schedule) || '待定', done: false,
  });
  return {
    reply: `⏰ 已新增健康提醒：${reminder.emoji} ${reminder.member}·${reminder.title}（${reminder.schedule}）`,
    views: [{ type: 'reminders', title: '健康提醒' }],
  };
}

/* ---------- tasks ---------- */
export const getTasks = (graph) => graph.findEntities('Task')
  .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.layer === 'user' ? -1 : 0) - (b.layer === 'user' ? -1 : 0));

/** Points earned per member from completed tasks. */
export function taskScores(graph) {
  const scores = Object.fromEntries(getMembers(graph).map(m => [m.name, 0]));
  getTasks(graph).filter(t => t.completed).forEach(t => (t.assignees || []).forEach(name => {
    scores[name] = (scores[name] || 0) + (Number(t.points) || 0);
  }));
  return Object.entries(scores).map(([name, points]) => ({ name, points })).sort((a, b) => b.points - a.points);
}

export function toggleTask(graph, id) {
  const t = graph.getEntity(id);
  if (t) graph.updateEntity(id, { completed: !t.completed });
}

function describeTasks(graph) {
  const tasks = getTasks(graph);
  return tasks.length
    ? `## 家庭任务\n${tasks.map(t => `- ${t.completed ? '[x]' : '[ ]'} ${t.title}（${(t.assignees || []).join('、') || '全家'}，${REPEAT_LABEL[t.repeatType] || ''}，${t.points}积分）`).join('\n')}`
    : '';
}

function listTasks(args, { graph }) {
  const name = asText(args.member);
  const tasks = getTasks(graph).filter(t => !name || (t.assignees || []).includes(name));
  if (!tasks.length) return { reply: '暂时没有家庭任务，可以说“添加任务 给小明 整理书桌 10积分”。', views: [] };
  const pending = tasks.filter(t => !t.completed);
  const top = taskScores(graph).filter(s => s.points > 0).slice(0, 3);
  return {
    reply: `✅ 家庭任务：已完成 ${tasks.length - pending.length}/${tasks.length}\n${pending.slice(0, 8).map(t => `⬜ ${t.emoji || '📝'} ${t.title}（${(t.assignees || []).join('、') || '全家'}，${t.points}积分）`).join('\n')}${top.length ? `\n\n🏆 积分：${top.map(s => `${s.name} ${s.points}`).join('，')}` : ''}`,
    views: [{ type: 'tasks', title: name ? `${name}的任务` : '家庭任务' }],
  };
}

function addTask(args, { graph }) {
  const title = asText(args.title);
  if (!title) return { reply: '请告诉我任务内容，例如“添加任务 给小明 整理书桌 10积分”。', views: [] };
  const assignees = asArray(args.assignees).map(asText).filter(Boolean).map(n => findMember(graph, n)?.name || n);
  const points = Number(args.points);
  const repeatType = REPEAT_LABEL[args.repeatType] ? args.repeatType : 'once';
  const task = graph.addEntity({
    id: newId('task'), type: 'Task', title, emoji: '📝', category: '其他', repeatType,
    assignees, points: Number.isFinite(points) && points >= 0 ? Math.round(points) : 10, completed: false, dueTime: '',
  });
  return {
    reply: `📝 已新增任务「${task.title}」，负责人：${assignees.join('、') || '全家'}，${REPEAT_LABEL[repeatType]}，${task.points} 积分。`,
    views: [{ type: 'tasks', title: '家庭任务' }],
  };
}

function completeTask(args, { graph, text }) {
  const query = asText(args.task) || asText(text);
  const tasks = getTasks(graph);
  const task = tasks.find(t => query.includes(t.title)) || tasks.find(t => query && t.title.includes(query));
  if (!task) return { reply: `没有找到任务「${query}」。可以说“今天有哪些家庭任务”查看列表。`, views: [] };
  if (task.completed) return { reply: `「${task.title}」已经完成过啦 👍`, views: [{ type: 'tasks', title: '家庭任务' }] };
  graph.updateEntity(task.id, { completed: true });
  return {
    reply: `🎉 「${task.title}」已完成！${(task.assignees || []).join('、') || '全家'} +${task.points} 积分`,
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
  list_trips: listTrips,
  trip_checklist: tripChecklist,
  health_overview: healthOverview,
  health_reminders: healthReminders,
  add_health_reminder: addHealthReminder,
  list_tasks: listTasks,
  add_task: addTask,
  complete_task: completeTask,
  agent_consult: agentConsult,
};
