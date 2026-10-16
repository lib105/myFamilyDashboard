import {
  upsertMember, findMember, ensureCondition, ensureAllergen, resolveCondition, setMemberAttribute,
  resolveIngredient, getIngredientFacts, getCapabilities, findCapabilityByName,
  getAgents, getCapabilityAgent, describeFamily, newId,
} from '../ontology/queries.js';
import { INGREDIENT_CATEGORIES } from '../ontology/schema.js';
import { recommendIngredients, recommendRecipes, currentMonth } from './recommender.js';
import { chatCompletion, isAIConfigured, parseJsonFromText } from './llmClient.js';
import { getAgentConfig, buildAgentPrompt, createCustomCapability } from './agentConfig.js';
import { FAMILY_HANDLERS } from './familyAgents.js';

export { describeFamily };

const asArray = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const asText = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

function memberIdsFromArg(graph, member) {
  const m = asText(member) && findMember(graph, asText(member));
  return m ? [m.id] : undefined;
}

function resolveItems(graph, items) {
  const resolved = [];
  const unknown = [];
  asArray(items).forEach(item => {
    const name = asText(typeof item === 'object' && item ? item.name : item);
    if (!name) return;
    const ing = resolveIngredient(graph, name);
    if (ing) {
      if (!resolved.some(r => r.ingredient.id === ing.id)) {
        const q = Number(typeof item === 'object' && item ? item.quantity : NaN);
        resolved.push({ ingredient: ing, quantity: Number.isFinite(q) && q > 0 ? q : 1 });
      }
    } else {
      unknown.push(name);
    }
  });
  return { resolved, unknown };
}

const topRecommended = (graph, n, filter = () => true) =>
  recommendIngredients(graph).items.filter(i => i.inSeason && i.score > 0 && filter(i)).slice(0, n).map(i => i.ingredient);

function offersFor(graph, ingredientId) {
  return graph.subjects('offerOf', ingredientId).map(offerId => {
    const offer = graph.getEntity(offerId);
    const store = graph.getEntity(graph.objects(offerId, 'soldAt')[0]);
    return offer && store ? { offer, store } : null;
  }).filter(Boolean).sort((a, b) => a.offer.price - b.offer.price);
}

/* =================================================================== */
/* Built-in capability handlers. Each returns { reply, views }.         */
/* =================================================================== */

function updateMemberProfile(args, { graph }) {
  const lines = [];
  const advice = [];
  graph.batch(() => {
    asArray(args.updates).forEach(u => {
      const name = asText(u?.member);
      if (!name) return;
      const { member, created } = upsertMember(graph, name);
      const added = [];
      if (Number.isFinite(Number(u.age)) && Number(u.age) > 0 && Number(u.age) < 130) {
        graph.updateEntity(member.id, { age: Number(u.age) });
        added.push(`${Number(u.age)}岁`);
      }
      asArray(u.conditions).map(asText).filter(Boolean).forEach(text => {
        const { entity, created: newConcept } = ensureCondition(graph, text);
        const had = graph.objects(member.id, 'hasCondition').includes(entity.id);
        graph.addTriple(member.id, 'hasCondition', entity.id);
        if (!had) {
          added.push(entity.label + (newConcept ? '（新概念已加入本体）' : ''));
          if (entity.advice) advice.push(`${entity.emoji || '•'} ${entity.label}：${entity.advice}`);
        }
      });
      asArray(u.removedConditions).map(asText).filter(Boolean).forEach(text => {
        const c = resolveCondition(graph, text);
        if (c && graph.objects(member.id, 'hasCondition').includes(c.id)) {
          graph.removeTriple(member.id, 'hasCondition', c.id);
          added.push(`移除「${c.label}」`);
        }
      });
      asArray(u.allergies).map(asText).filter(Boolean).forEach(text => {
        const { entity } = ensureAllergen(graph, text);
        const had = graph.objects(member.id, 'allergicTo').includes(entity.id);
        graph.addTriple(member.id, 'allergicTo', entity.id);
        if (!had) added.push(`对${entity.label}过敏`);
      });
      asArray(u.attributes).forEach(a => {
        const key = asText(a?.key);
        const value = asText(a?.value);
        if (!key || !value) return;
        const had = graph.objects(member.id, 'hasAttribute').some(x => x.key === key && x.value === value);
        setMemberAttribute(graph, member.id, key, value);
        if (!had) added.push(`${key}：${value}`);
      });
      if (created || added.length) {
        lines.push(`${member.avatar} ${member.name}${created ? '（新成员）' : ''}：${added.join('、') || '已建档'}`);
      }
    });
  });
  if (!lines.length) return { reply: '', views: [] };
  return {
    reply: `🩺 已更新家庭健康档案：\n${lines.join('\n')}${advice.length ? `\n\n饮食建议：\n${[...new Set(advice)].join('\n')}` : ''}`,
    views: [{ type: 'profile', title: '家庭健康档案' }],
  };
}

function viewFamilyProfile(args, { graph }) {
  return {
    reply: `👨‍👩‍👧‍👦 当前家庭档案：\n${describeFamily(graph) || '还没有成员，告诉我“爸爸有高血压”即可建档。'}`,
    views: [{ type: 'profile', title: '家庭健康档案' }],
  };
}

function recommendProduce(args, { graph }) {
  const category = INGREDIENT_CATEGORIES[args.category] ? args.category : 'all';
  const memberIds = memberIdsFromArg(graph, args.member);
  const result = recommendIngredients(graph, { category, memberIds });
  const top = result.items.filter(i => i.score > 0).slice(0, 5);
  const catLabel = category === 'all' ? '食材' : INGREDIENT_CATEGORIES[category].label;
  const who = memberIds ? graph.getEntity(memberIds[0]).name : '全家';
  const lines = top.map(i => {
    const why = [...new Set(i.reasons.map(r => `${r.member.name}·${r.condition.label}`))].slice(0, 3).join('，');
    return `${i.ingredient.emoji} ${i.ingredient.label}${i.inSeason ? '（当季）' : ''}${why ? `：适合 ${why}` : ''}`;
  });
  const excluded = result.excluded.slice(0, 3).map(e => `${e.ingredient.label}（${e.reason}）`);
  return {
    reply: `${result.season.emoji} ${currentMonth()}月·${result.season.label}，为${who}推荐的${catLabel}：\n${lines.join('\n')}${excluded.length ? `\n\n🚫 已避开：${excluded.join('；')}` : ''}`,
    views: [{ type: 'produce', title: `${result.season.label}${who}推荐${catLabel}`, args: { category, memberIds } }],
  };
}

function recommendRecipesHandler(args, { graph }) {
  const mealType = asText(args.mealType) || undefined;
  const memberIds = memberIdsFromArg(graph, args.member);
  const { recipes } = recommendRecipes(graph, { mealType, memberIds });
  if (!recipes.length) {
    return { reply: `暂时没有找到适合的${mealType || ''}食谱，可以换个餐次试试～`, views: [] };
  }
  return {
    reply: `🍳 推荐${mealType ? `${mealType}` : ''}简单食谱：\n${recipes.map(r => `${r.recipe.emoji} ${r.recipe.label}（${r.recipe.minutes}分钟）`).join('\n')}`,
    views: [{ type: 'recipes', title: `${mealType || ''}简单食谱推荐`, args: { mealType, memberIds } }],
  };
}

async function collectIngredientData(args, { graph }) {
  const { resolved, unknown } = resolveItems(graph, args.items);
  const collected = [];
  const missing = [];
  for (const name of unknown) {
    if (isAIConfigured()) {
      try {
        collected.push(await collectIngredientWithLLM(graph, name));
      } catch (e) {
        missing.push(`${name}（${e.message}）`);
      }
    } else {
      missing.push(name);
    }
  }
  const ids = [...resolved.map(r => r.ingredient.id), ...collected.map(i => i.id)];
  if (!ids.length) {
    return {
      reply: missing.length
        ? `本地食材库暂无「${missing.join('、')}」的数据。配置 AI Key 后，食材数据 Agent 可以自动采集并加入知识图谱。`
        : '请告诉我想了解哪种食材，例如“介绍一下山药”。',
      views: [],
    };
  }
  const lines = ids.map(id => {
    const f = getIngredientFacts(graph, graph.getEntity(id));
    return `${f.ingredient.emoji} ${f.ingredient.label}：富含${(f.ingredient.nutrients || []).join('、') || '—'}；当季：${f.seasons.map(s => s.label).join('、') || '—'}`;
  });
  return {
    reply: `📚 食材数据：\n${lines.join('\n')}${collected.length ? `\n\n✨ 新采集并加入知识图谱：${collected.map(c => c.label).join('、')}` : ''}${missing.length ? `\n未能获取：${missing.join('、')}` : ''}`,
    views: [{ type: 'ingredient_info', title: '食材数据', args: { ingredientIds: ids } }],
  };
}

async function collectIngredientWithLLM(graph, name) {
  const conditions = graph.findEntities('HealthCondition').map(c => `${c.id}=${c.label}`).join(', ');
  const allergens = graph.findEntities('Allergen').map(a => `${a.id}=${a.label}`).join(', ');
  const msg = await chatCompletion({
    messages: [
      { role: 'system', content: '你是食材营养数据采集助手，只输出 JSON。' },
      { role: 'user', content: `请输出食材「${name}」的数据，JSON 字段：label, emoji, category(fruit|vegetable|mushroom|grain|protein|nut), months(1-12 当季月份数组), nutrients(字符串数组), benefits(有益的健康状况 id 数组), cautions(需慎食的健康状况 id 数组), allergens(过敏原 id 数组), note。可用健康状况：${conditions}。可用过敏原：${allergens}。` },
    ],
  });
  const data = parseJsonFromText(msg.content);
  if (!data || typeof data !== 'object') throw new Error('AI 返回格式无法解析');
  const months = asArray(data.months).map(Number).filter(m => Number.isInteger(m) && m >= 1 && m <= 12);
  const entity = graph.addEntity({
    id: newId('ing'),
    type: 'Ingredient',
    label: asText(data.label) || name,
    emoji: asText(data.emoji).slice(0, 4) || '🥗',
    category: INGREDIENT_CATEGORIES[data.category] ? data.category : 'vegetable',
    months,
    nutrients: asArray(data.nutrients).map(asText).filter(Boolean).slice(0, 8),
    note: asText(data.note).slice(0, 120),
    synonyms: [name],
    source: 'AI 采集',
  });
  const link = (rel, ids, type) => asArray(ids).map(asText).forEach(id => {
    if (graph.getEntity(id)?.type === type) graph.addTriple(entity.id, rel, id);
  });
  graph.batch(() => {
    link('benefits', data.benefits, 'HealthCondition');
    link('cautionFor', data.cautions, 'HealthCondition');
    link('containsAllergen', data.allergens, 'Allergen');
    graph.findEntities('Season').filter(s => s.months.some(m => months.includes(m)))
      .forEach(s => graph.addTriple(entity.id, 'availableIn', s.id));
  });
  return entity;
}

function querySupermarketPrice(args, { graph }) {
  const { resolved, unknown } = resolveItems(graph, args.items);
  const ingredients = resolved.length ? resolved.map(r => r.ingredient) : topRecommended(graph, 5);
  const rows = ingredients.map(i => ({ ingredient: i, offers: offersFor(graph, i.id) })).filter(r => r.offers.length);
  if (!rows.length) return { reply: `暂未查到「${unknown.join('、') || '相关食材'}」的超市价格。`, views: [] };
  return {
    reply: `💰 超市比价（模拟数据）：\n${rows.map(r => `${r.ingredient.emoji} ${r.ingredient.label}：${r.offers[0].store.label}最便宜 ¥${r.offers[0].offer.price}/${r.offers[0].offer.unit}`).join('\n')}${resolved.length ? '' : '\n（未指定食材，已按当季推荐比价）'}`,
    views: [{ type: 'prices', title: '超市价格比价', args: { ingredientIds: rows.map(r => r.ingredient.id) } }],
  };
}

function queryAppDiscounts(args, { graph }) {
  const { resolved } = resolveItems(graph, args.items);
  const wanted = new Set((resolved.length ? resolved.map(r => r.ingredient) : topRecommended(graph, 12)).map(i => i.id));
  const promos = graph.findEntities('Promotion')
    .map(p => ({ p, hits: graph.objects(p.id, 'promotes').filter(id => wanted.has(id)).length }))
    .filter(x => !resolved.length || x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map(x => x.p);
  if (!promos.length) return { reply: '暂时没有找到相关的打折信息。', views: [] };
  return {
    reply: `🏷️ 其他 App 优惠（模拟数据）：\n${promos.slice(0, 5).map(p => `${p.emoji} ${p.app}：${p.title}（${p.validUntil}）`).join('\n')}`,
    views: [{ type: 'discounts', title: '各 App 打折信息', args: { promotionIds: promos.map(p => p.id) } }],
  };
}

function placeOrder(args, { graph }) {
  const { resolved, unknown } = resolveItems(graph, args.items);
  const lines = resolved.length ? resolved : topRecommended(graph, 4, i => ['fruit', 'vegetable'].includes(i.ingredient.category))
    .map(ingredient => ({ ingredient, quantity: 1 }));
  if (!lines.length) return { reply: '请告诉我要买什么，例如“帮我买2斤猕猴桃和1盒豆腐”。', views: [] };

  const stores = graph.findEntities('Store');
  const quotes = stores.map(store => {
    const items = lines.map(l => {
      const offer = offersFor(graph, l.ingredient.id).find(o => o.store.id === store.id);
      return offer && { ingredientId: l.ingredient.id, label: l.ingredient.label, emoji: l.ingredient.emoji, quantity: l.quantity, unit: offer.offer.unit, price: offer.offer.price };
    });
    return { store, items: items.filter(Boolean), complete: items.every(Boolean) };
  }).filter(q => q.items.length)
    .map(q => ({ ...q, total: Math.round(q.items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100 }))
    .sort((a, b) => Number(b.complete) - Number(a.complete) || a.total - b.total);
  const best = quotes[0];
  if (!best) return { reply: '这些食材暂时没有在售的超市。', views: [] };

  const order = graph.addEntity({
    id: newId('order'), type: 'Order', status: '待确认', createdAt: new Date().toISOString(),
    items: best.items, total: best.total, storeLabel: best.store.label, delivery: best.store.delivery,
  });
  graph.batch(() => {
    graph.addTriple(order.id, 'orderedFrom', best.store.id);
    best.items.forEach(i => graph.addTriple(order.id, 'orderContains', i.ingredientId));
  });
  return {
    reply: `🧾 已在「${best.store.label}」生成待确认订单（模拟），合计 ¥${best.total}，${best.store.delivery}。请在首页订单卡片中确认下单。${unknown.length ? `\n未识别：${unknown.join('、')}` : ''}${resolved.length ? '' : '\n（未指定食材，已按当季推荐选择）'}`,
    views: [{ type: 'order', title: '采购订单（模拟）', args: { orderId: order.id } }],
  };
}

export function confirmOrder(graph, orderId) {
  const order = graph.getEntity(orderId);
  if (!order || order.status !== '待确认') return;
  graph.batch(() => {
    graph.updateEntity(orderId, { status: '已下单' });
    const now = new Date().toLocaleString('zh-CN', { hour12: false });
    const ship = graph.addEntity({
      id: newId('ship'), type: 'Shipment', trackingNo: `FD${Date.now().toString().slice(-10)}`,
      carrier: `${order.storeLabel}·同城配送`, item: order.items.map(i => `${i.label} x${i.quantity}`).join('、'),
      status: '待配送', eta: order.delivery,
      events: [{ time: now, desc: `${order.storeLabel}已接单，正在拣货（模拟）` }],
    });
    graph.addTriple(ship.id, 'shipmentOf', orderId);
  });
}

export function cancelOrder(graph, orderId) {
  const order = graph.getEntity(orderId);
  if (order?.status === '待确认') graph.updateEntity(orderId, { status: '已取消' });
}

function trackDelivery(args, { graph }) {
  const ships = graph.findEntities('Shipment').sort((a, b) => (a.layer === 'user' ? -1 : 0) - (b.layer === 'user' ? -1 : 0));
  if (!ships.length) return { reply: '目前没有进行中的快递。', views: [] };
  return {
    reply: `🚚 物流信息：\n${ships.map(s => `📦 ${s.item}｜${s.carrier} ${s.trackingNo}｜${s.status}，预计${s.eta}`).join('\n')}`,
    views: [{ type: 'delivery', title: '物流快递' }],
  };
}

function manageCapabilities(args, { graph }) {
  const action = asText(args.action) || 'list';
  const views = [{ type: 'capabilities', title: 'Agent 能力清单' }];
  if (action === 'list') {
    const caps = getCapabilities(graph);
    return {
      reply: `🧠 当前共有 ${caps.length} 项能力：\n${caps.map(c => `${c.enabled === false ? '⏸️' : '✅'} ${c.label}`).join('\n')}\n\n可以说“添加能力 名称:xxx 关键词:a,b 回复:xxx”来扩展。`,
      views,
    };
  }
  if (action === 'add') {
    const label = asText(args.name);
    const keywords = asArray(args.keywords).flatMap(k => asText(k).split(/[,，、\s]+/)).filter(Boolean);
    const reply = asText(args.reply);
    const prompt = asText(args.prompt);
    if (!label || !keywords.length || (!reply && !prompt)) {
      return { reply: '新增能力需要：名称、关键词，以及“回复”（模拟数据）或“提示词”（调用 AI）。\n例如：添加能力 名称:社区团购查询 关键词:团购,拼团 回复:今晚8点社区团购截单，白菜9.9元10斤', views };
    }
    if (findCapabilityByName(graph, label)?.label === label) return { reply: `能力「${label}」已存在。`, views };
    const agentName = asText(args.agent);
    let agent = agentName ? getAgents(graph).find(a => a.label === agentName || a.label.includes(agentName)) : graph.getEntity('agent_custom');
    if (!agent) agent = graph.addEntity({ id: newId('agent'), type: 'Agent', label: agentName, emoji: '🤖', description: '通过对话创建的 Agent' });
    createCustomCapability(graph, { label, keywords, reply, prompt, agentId: agent.id });
    return { reply: `✅ 已为「${agent.label}」新增能力「${label}」，触发关键词：${keywords.join('、')}。现在就可以试试！`, views };
  }
  const cap = findCapabilityByName(graph, asText(args.name));
  if (!cap) return { reply: `没有找到能力「${asText(args.name)}」。`, views };
  if (action === 'enable' || action === 'disable') {
    if (cap.id === 'manage_capabilities' && action === 'disable') return { reply: '能力管理本身不能被禁用。', views };
    graph.updateEntity(cap.id, { enabled: action === 'enable' });
    return { reply: `${action === 'enable' ? '▶️ 已启用' : '⏸️ 已禁用'}能力「${cap.label}」。`, views };
  }
  if (action === 'remove') {
    if (cap.layer === 'base') return { reply: `「${cap.label}」是内置能力，不能删除，可以禁用。`, views };
    graph.removeEntity(cap.id);
    return { reply: `🗑️ 已删除能力「${cap.label}」。`, views };
  }
  return { reply: `不支持的操作：${action}`, views };
}

async function runCustomCapability(cap, args, { graph, text }) {
  const input = asText(args.input) || text;
  if (cap.kind === 'llm') {
    if (!isAIConfigured()) return { reply: `能力「${cap.label}」需要调用 AI，请先在「AI 设置」中配置 API Key。`, views: [] };
    const prompt = cap.prompt.replaceAll('{input}', input).replaceAll('{family}', describeFamily(graph));
    const agent = getCapabilityAgent(graph, cap);
    const system = `${agent ? `${buildAgentPrompt(getAgentConfig(graph, agent))}\n\n` : ''}你现在执行家庭助手的「${cap.label}」能力。`;
    const msg = await chatCompletion({ messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] });
    const content = asText(msg.content) || '（AI 没有返回内容）';
    return { reply: content, views: [{ type: 'text', title: cap.label, data: { text: content } }] };
  }
  return { reply: cap.reply, views: [{ type: 'text', title: cap.label, data: { text: cap.reply } }] };
}

const HANDLERS = {
  update_member_profile: updateMemberProfile,
  view_family_profile: viewFamilyProfile,
  recommend_produce: recommendProduce,
  recommend_recipes: recommendRecipesHandler,
  collect_ingredient_data: collectIngredientData,
  query_supermarket_price: querySupermarketPrice,
  query_app_discounts: queryAppDiscounts,
  place_order: placeOrder,
  track_delivery: trackDelivery,
  manage_capabilities: manageCapabilities,
  ...FAMILY_HANDLERS,
};

/** Executes a Capability entity with the given arguments. */
export async function executeCapability(capability, args, ctx) {
  if (capability.enabled === false) return { reply: `能力「${capability.label}」已被禁用。`, views: [] };
  const handler = capability.kind === 'builtin' ? HANDLERS[capability.handler] : null;
  const context = { ...ctx, capability };
  const result = handler ? await handler(args || {}, context) : await runCustomCapability(capability, args || {}, context);
  return {
    reply: result.reply,
    views: (result.views || []).map(v => ({ ...v, capabilityId: capability.id })),
  };
}

