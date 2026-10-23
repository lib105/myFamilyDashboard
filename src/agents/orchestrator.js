import { routeLocally, parseCapabilityCommand, parseAgentCommand } from './router.js';
import { parseLayoutCommand, moduleOf, moduleLabel, arrangeHomeTool, ARRANGE_HOME_TOOL } from './homeLayout.js';
import { executeCapability, describeFamily } from './capabilities.js';
import { chatCompletion, isAIConfigured, loadAISettings } from './llmClient.js';
import { getAgents, getCapabilities, getCapabilityAgent, isMutatingCapability, getDependentCapabilities } from '../ontology/queries.js';
import { getAgentConfig } from './agentConfig.js';
import { CLASSES, RELATIONS, seasonOfMonth } from '../ontology/schema.js';
import { currentMonth } from './recommender.js';
import { prepareShoppingTurn } from './shoppingRequirements.js';
import { isFliggyContextReply } from './fliggyContext.js';

const HELP = `我是家庭助手，可以这样和我说：
• “爸爸有高血压，妈妈有过敏性鼻炎，小明10岁免疫力低下” —— 记录健康档案（属性不限）
• “推荐点当季水果” / “今晚做什么菜” —— 推荐食材与食谱
• “今天天气怎么样” —— 天气 Agent
• “我们有哪些旅行计划” / “大阪行前清单还差什么” —— 旅行 Agent
• “全家健康状况怎么样” / “提醒爸爸每晚9点测血压” —— 健康 Agent
• “今天有哪些家庭任务” / “添加任务 给小明 整理书桌 10积分” / “浇花完成了” —— 任务 Agent
• “西兰花哪家超市便宜” / “帮我买2斤猕猴桃” / “我的快递到哪了” —— 比价、模拟下单与物流
• “隐藏家庭档案” / “把超市打折信息放到最上面” / “恢复默认布局” —— 首页 Agent 调整卡片布局
• “你能做什么” / “添加能力 名称:xxx 关键词:a,b 回复:xxx” —— 管理和扩展能力`;

const oneLine = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function toolsFromCapabilities(graph) {
  return getCapabilities(graph, { enabledOnly: true }).map(c => {
    const agent = getCapabilityAgent(graph, c);
    // The home agent's tool lists the valid module ids in its schema.
    if (c.id === ARRANGE_HOME_TOOL) return arrangeHomeTool();
    return {
      type: 'function',
      function: {
        name: c.id,
        description: `[${agent?.label || 'Agent'}] ${c.label}：${c.description || ''}`.slice(0, 1000),
        parameters: c.params || { type: 'object', properties: { input: { type: 'string' } } },
      },
    };
  });
}

function systemPrompt(graph) {
  const month = currentMonth();
  return [
    '你是“家庭助手”的意图路由器，负责理解用户意图并调用合适的工具（Agent 能力）来动态更新首页。',
    `今天是 ${new Date().toLocaleDateString('zh-CN')}，${month}月，${seasonOfMonth(month).label}。`,
    `本体类：${Object.entries(CLASSES).map(([k, v]) => `${k}(${v.label})`).join('、')}。`,
    `本体关系：${Object.entries(RELATIONS).map(([k, v]) => `${v.domain}-${k}->${v.range}`).join('、')}。`,
    `家庭成员档案：\n${describeFamily(graph) || '（暂无）'}`,
    `Agent（工具名前的方括号为所属 Agent）：\n${getAgents(graph).map(a => {
      const c = getAgentConfig(graph, a);
      return `- ${c.emoji} ${c.label}：${oneLine(c.description, 80)}｜指令摘要：${oneLine(c.agentMd, 160)}`;
    }).join('\n')}`,
    '规则：用户描述家人健康状况/属性时调用 update_member_profile（属性不限，未知属性放进 attributes）；可同时调用多个工具；',
    '旅行、健康、任务相关的开放式问题优先调用对应 Agent 的咨询工具（它会使用该 Agent 的 Agent.md / Skill.md / Context.md 与知识库）；',
    '用户要求隐藏/显示/置顶首页模块或恢复默认布局时调用 arrange_home；',
    '旅行出行搜索时：用户询问飞猪、酒店预订、机票搜索、景点门票等具体旅行产品时，调用 fliggy_travel_search 直连飞猪 AI 开放平台；关于既定家庭旅行计划调用 list_trips / trip_checklist；开放式旅行建议调用 travel_consult；',
    '搜索视频时必须调用 search_video_with_browser；浏览器由应用服务端执行，不是你自身的浏览器工具。不要声称工具不可用或编造视频链接；只有实际执行结果才能说明成功或失败。',
    '三家商超真实门店报价待核验；query_supermarket_price 仅说明不可用，不得把旧演示数据或京东代购写成三家超市实价。山姆已停用。京东结果附采集时商品卡片来源截图，截图缺失如实提示。',
    '网络商品搜索仅支持京东；淘宝及天猫商品搜索已取消，不尝试调用这些平台。先确认类型、品牌、规格和预算，再调用 search_products_with_browser；只读网页搜索，不要用商超报价代替京东结果。会员、优惠券和满减条件必须保留，不能推算无条件到手价。',
    '不需要工具时直接简短回答。健康相关建议仅供参考，不替代医生意见。回答使用中文。',
  ].join('\n');
}

async function planWithLLM(text, history, graph, settings) {
  const messages = [
    { role: 'system', content: systemPrompt(graph) },
    ...history.slice(-8).map(m => ({ role: m.role, content: m.text })),
    { role: 'user', content: text },
  ];
  const msg = await chatCompletion({ messages, tools: toolsFromCapabilities(graph), settings });
  const parsed = (msg.tool_calls || []).map(tc => {
    let args = {};
    try {
      args = JSON.parse(tc.function?.arguments || '{}');
    } catch {
      /* ignore malformed arguments */
    }
    return { capabilityId: tc.function?.name, args };
  });
  const calls = parsed.filter(c => graph.getEntity(c.capabilityId)?.type === 'Capability');
  return { calls, content: msg.content || '' };
}

/**
 * Handles one user utterance: plan (LLM tool-calling when an AI key is
 * configured, otherwise local rules) → execute capabilities → collect replies
 * and home-page views.
 */
export async function handleUserMessage(text, { graph, history = [], shoppingRequestId } = {}) {
  const directCommand = parseAgentCommand(text, graph) || (isFliggyContextReply(text, history)
    && graph.getEntity('fliggy_travel_search')?.type === 'Capability'
    ? { capabilityId: 'fliggy_travel_search', args: { query: text } } : null);
  const otherCommand = directCommand && directCommand.capabilityId !== 'search_products_with_browser';
  const shoppingTurn = parseCapabilityCommand(text) || parseLayoutCommand(text) || otherCommand ? null
    : prepareShoppingTurn(text, { graph, requestId: shoppingRequestId });
  if (shoppingTurn?.result) return shoppingTurn.result;
  const settings = loadAISettings();
  let calls = null;
  let llmContent = '';
  let mode = 'local';
  let note = '';
  // Browser search is an application action, not dependent on an LLM claiming tool access.
  const agentCommand = shoppingTurn?.request
    ? { capabilityId: 'search_products_with_browser', args: { requestId: shoppingTurn.request.id } }
    : directCommand;
  const isBrowserCall = call => call && graph.getEntity(call.capabilityId)?.execution === 'browser';
  const browserCommand = isBrowserCall(agentCommand) ? agentCommand : null;
  if (browserCommand && graph.getEntity(browserCommand.capabilityId).enabled === false) {
    return { reply: `能力「${graph.getEntity(browserCommand.capabilityId).label}」已禁用，未执行浏览器操作，也未替换为模拟报价。`, views: [], trace: [], mode: 'local', layout: null, unanswered: null };
  }
  const layoutCommand = parseCapabilityCommand(text) || agentCommand ? null : parseLayoutCommand(text);
  if (agentCommand?.capabilityId === 'fliggy_travel_search') {
    if (graph.getEntity(agentCommand.capabilityId).enabled === false) {
      return { reply: '飞猪旅行实时搜索能力已禁用，未调用接口。', views: [], trace: [], mode: 'local', layout: null, unanswered: null };
    }
    // Explicit travel searches are application actions, not an LLM routing decision.
    calls = [agentCommand];
  } else if (browserCommand) {
    calls = [browserCommand];
  } else if (layoutCommand && graph.getEntity(ARRANGE_HOME_TOOL)?.enabled !== false) {
    calls = [{ capabilityId: ARRANGE_HOME_TOOL, args: layoutCommand }];
  } else if (isAIConfigured(settings)) {
    try {
      const plan = await planWithLLM(text, history, graph, settings);
      calls = plan.calls;
      llmContent = plan.content;
      // Some OpenAI-compatible models ignore tool_choice:auto. Recover browser intents locally.
      if (!calls.length) {
        const browserCalls = routeLocally(text, graph).filter(isBrowserCall);
        if (browserCalls.length) { calls = browserCalls; llmContent = ''; }
      }
      mode = 'llm';
    } catch (e) {
      note = `⚠️ AI 调用失败，已切换到本地模式：${e.message}`;
    }
  }
  if (!calls) calls = routeLocally(text, graph);
  // Discard speculative LLM preambles when a real browser action will provide grounded results.
  if (calls.some(isBrowserCall)) llmContent = '';

  // Ontology-driven ordering: mutating capabilities execute before read/recommendation capabilities.
  const autoRefreshIds = new Set(
    getCapabilities(graph).filter(c => c.autoRefreshOnMutation).map(c => c.id),
  );
  const seen = new Set();
  calls = [
    ...calls.filter(c => isMutatingCapability(graph, c.capabilityId)),
    ...calls.filter(c => !isMutatingCapability(graph, c.capabilityId)),
  ].filter(c => {
    if (!autoRefreshIds.has(c.capabilityId)) return true;
    const key = JSON.stringify([c.capabilityId, c.args?.member || '', c.args?.category || 'all', c.args?.mealType || '']);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const replies = [];
  const failures = [];
  let layout = null;
  const autoReplies = [];
  const views = [];
  const trace = [];
  let shoppingMeta = {};
  // `calls` may grow while iterating: mutating capabilities trigger dependent readers via ontology relations,
  // and the home agent appends cards for shown / pinned modules.
  for (const call of calls) {
    const capability = graph.getEntity(call.capabilityId);
    if (!capability || capability.enabled === false) continue;
    const agent = getCapabilityAgent(graph, capability);
    const entry = { agent: agent ? `${agent.emoji} ${agent.label}` : 'Agent', capability: capability.label, auto: call.auto };
    trace.push(entry);
    try {
      const beforeVersion = graph.getVersion();
      const result = await executeCapability(capability, call.args, { graph, text, history });
      for (const key of ['shoppingRequestId', 'shoppingClarification', 'followUp', 'fliggyContext']) {
        if (Object.hasOwn(result, key)) shoppingMeta = { ...shoppingMeta, [key]: result[key] };
      }
      const graphMutated = graph.getVersion() > beforeVersion || Boolean(result.profileUpdated);
      if (graphMutated) {
        const mutatedClassIds = graph.objects(capability.id, 'mutatesClass');
        getDependentCapabilities(graph, mutatedClassIds).forEach(dep => {
          if (!calls.some(c => c.capabilityId === dep.id)) {
            calls.push({ capabilityId: dep.id, args: {}, auto: true });
          }
        });
      }
      if (result.reply) (call.auto ? autoReplies : replies).push(result.reply);
      views.push(...result.views.map(v => ({ ...v, auto: Boolean(call.auto) })));
      if (result.layout && !layout) {
        layout = result.layout;
        const verb = { hide: '隐藏', show: '显示', pin: '置顶', reset: '恢复默认布局' }[layout.action];
        entry.capability = `${verb}${layout.modules.length ? ` ${layout.modules.map(moduleLabel).join('、')}` : ''}`;
        // Shown / pinned modules get a fresh card in case none is on the page yet.
        if (['show', 'pin'].includes(layout.action)) {
          layout.modules.map(moduleOf).filter(m => m.capabilityId && graph.getEntity(m.capabilityId)?.enabled !== false)
            .filter(m => !calls.some(c => c.capabilityId === m.capabilityId))
            .forEach(m => calls.push({ capabilityId: m.capabilityId, args: { ...(m.args || {}) }, auto: true }));
        }
      }
    } catch (e) {
      failures.push(`「${capability.label}」执行失败：${e.message}`);
      replies.push(`❌ 「${capability.label}」执行失败：${e.message}`);
    }
  }

  if (!replies.length) replies.push(...autoReplies);
  const reply = [note, llmContent, ...replies].filter(Boolean).join('\n\n') || (calls.length ? '已处理～' : HELP);
  // Nothing understood the question (no tool, no LLM answer) or every tool failed.
  const unanswered = !shoppingMeta.shoppingClarification && !llmContent && !views.length
    && (!trace.length || (failures.length > 0 && failures.length === trace.length));
  return {
    reply, views, trace, mode, layout, ...shoppingMeta,
    unanswered: unanswered ? { reason: failures.length ? failures.join('；') : '没有找到能处理这个问题的 Agent 能力', note } : null,
  };
}
