import { routeLocally } from './router.js';
import { executeCapability, describeFamily } from './capabilities.js';
import { chatCompletion, isAIConfigured, loadAISettings } from './llmClient.js';
import { getCapabilities, getCapabilityAgent } from '../ontology/queries.js';
import { CLASSES, RELATIONS, seasonOfMonth } from '../ontology/schema.js';
import { currentMonth } from './recommender.js';

const HELP = `我是家庭饮食助手，可以这样和我说：
• “爸爸有高血压，妈妈有过敏性鼻炎，小明10岁免疫力低下” —— 记录健康档案（属性不限）
• “推荐点当季水果” / “今晚做什么菜” —— 推荐食材与食谱
• “西兰花哪家超市便宜” / “最近有什么打折的蔬菜” —— 比价与优惠
• “帮我买2斤猕猴桃” / “我的快递到哪了” —— 模拟下单与物流
• “你能做什么” / “添加能力 名称:xxx 关键词:a,b 回复:xxx” —— 管理和扩展能力`;

function toolsFromCapabilities(graph) {
  return getCapabilities(graph, { enabledOnly: true }).map(c => {
    const agent = getCapabilityAgent(graph, c);
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
    '你是“家庭饮食助手”的意图路由器，负责理解用户意图并调用合适的工具（Agent 能力）来动态更新首页。',
    `今天是 ${new Date().toLocaleDateString('zh-CN')}，${month}月，${seasonOfMonth(month).label}。`,
    `本体类：${Object.entries(CLASSES).map(([k, v]) => `${k}(${v.label})`).join('、')}。`,
    `本体关系：${Object.entries(RELATIONS).map(([k, v]) => `${v.domain}-${k}->${v.range}`).join('、')}。`,
    `家庭成员档案：\n${describeFamily(graph) || '（暂无）'}`,
    '规则：用户描述家人健康状况/属性时调用 update_member_profile（属性不限，未知属性放进 attributes）；可同时调用多个工具；',
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
  const calls = (msg.tool_calls || []).map(tc => {
    let args = {};
    try {
      args = JSON.parse(tc.function?.arguments || '{}');
    } catch {
      /* ignore malformed arguments */
    }
    return { capabilityId: tc.function?.name, args };
  }).filter(c => graph.getEntity(c.capabilityId)?.type === 'Capability');
  return { calls, content: msg.content || '' };
}

/**
 * Handles one user utterance: plan (LLM tool-calling when an AI key is
 * configured, otherwise local rules) → execute capabilities → collect replies
 * and home-page views.
 */
export async function handleUserMessage(text, { graph, history = [] }) {
  const settings = loadAISettings();
  let calls = null;
  let llmContent = '';
  let mode = 'local';
  let note = '';

  if (isAIConfigured(settings)) {
    try {
      const plan = await planWithLLM(text, history, graph, settings);
      calls = plan.calls;
      llmContent = plan.content;
      mode = 'llm';
    } catch (e) {
      note = `⚠️ AI 调用失败，已切换到本地模式：${e.message}`;
    }
  }
  if (!calls) calls = routeLocally(text, graph);

  // After profile changes, refresh home recommendations automatically.
  if (calls.some(c => c.capabilityId === 'update_member_profile')
    && !calls.some(c => ['recommend_produce', 'recommend_recipes'].includes(c.capabilityId))) {
    ['recommend_produce', 'recommend_recipes'].forEach(id => {
      if (graph.getEntity(id)?.enabled !== false) calls.push({ capabilityId: id, args: {}, auto: true });
    });
  }

  const replies = [];
  const autoReplies = [];
  const views = [];
  const trace = [];
  for (const call of calls) {
    const capability = graph.getEntity(call.capabilityId);
    if (!capability) continue;
    const agent = getCapabilityAgent(graph, capability);
    trace.push({ agent: agent ? `${agent.emoji} ${agent.label}` : 'Agent', capability: capability.label, auto: call.auto });
    try {
      const result = await executeCapability(capability, call.args, { graph, text });
      if (result.reply) (call.auto ? autoReplies : replies).push(result.reply);
      views.push(...result.views);
    } catch (e) {
      replies.push(`❌ 「${capability.label}」执行失败：${e.message}`);
    }
  }

  if (!replies.length) replies.push(...autoReplies);
  const reply = [note, llmContent, ...replies].filter(Boolean).join('\n\n') || (calls.length ? '已处理～' : HELP);
  return { reply, views, trace, mode };
}
