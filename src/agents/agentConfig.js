/**
 * Agent configuration (inspired by Microsoft Copilot agent builder):
 *  - basic info: name, icon, description
 *  - Agent.md (instructions), Skill.md (skills), Context.md (background context)
 *  - tools: the Capability entities provided by the agent
 *  - knowledge: uploaded files and web URLs
 *  - starter prompts
 * The configuration is stored as properties of the Agent entity in the
 * knowledge graph, so it is persisted together with the rest of the graph.
 */
import agentData from '../data/food/agents.json';
import { getCapabilities, newId } from '../ontology/queries.js';
import { chatCompletion, isAIConfigured } from './llmClient.js';

export const KNOWLEDGE_LIMITS = {
  maxItems: 20,
  maxFileBytes: 5 * 1024 * 1024,
  maxCharsPerItem: 50000,
  maxTotalChars: 200000,
  fetchTimeoutMs: 8000,
};

export const TEXT_FILE_EXTENSIONS = ['md', 'markdown', 'txt', 'json', 'csv', 'tsv', 'html', 'htm', 'xml', 'yaml', 'yml', 'log'];

export const MD_FIELDS = [
  { key: 'agentMd', file: 'Agent.md', title: '指令 · Agent.md', hint: '定义 Agent 的角色、语气、行为准则与边界（相当于系统提示词）。' },
  { key: 'skillMd', file: 'Skill.md', title: '技能 · Skill.md', hint: '描述 Agent 擅长做什么、如何完成任务、输出格式等。' },
  { key: 'contextMd', file: 'Context.md', title: '上下文 · Context.md', hint: '提供家庭背景、偏好、约定等长期上下文，回答时会一并参考。' },
];

const asText = (v) => (typeof v === 'string' ? v : '');

export function agentCapabilities(graph, agentId) {
  return getCapabilities(graph).filter(c => graph.objects(c.id, 'providedBy').includes(agentId));
}

export function defaultAgentMd(agent) {
  return `# 角色\n你是家庭助手中的「${agent.label || 'Agent'}」。\n\n# 职责\n${agent.description || '（请描述该 Agent 的职责）'}`;
}

export function defaultSkillMd(graph, agent) {
  const caps = agent.id ? agentCapabilities(graph, agent.id) : [];
  return `# 技能\n${caps.map(c => `- ${c.label}：${c.description || ''}`).join('\n') || '- （暂无，可在「工具」中添加）'}`;
}

/** Returns the effective configuration of an Agent entity (with defaults). */
export function getAgentConfig(graph, agent) {
  return {
    id: agent.id,
    label: asText(agent.label),
    emoji: asText(agent.emoji) || '🤖',
    description: asText(agent.description),
    agentMd: typeof agent.agentMd === 'string' ? agent.agentMd : defaultAgentMd(agent),
    skillMd: typeof agent.skillMd === 'string' ? agent.skillMd : defaultSkillMd(graph, agent),
    contextMd: asText(agent.contextMd),
    starters: Array.isArray(agent.starters) ? agent.starters.filter(s => typeof s === 'string') : [],
    knowledge: Array.isArray(agent.knowledge) ? agent.knowledge : [],
    knowledgeOnly: Boolean(agent.knowledgeOnly),
  };
}

/** Patch that restores a built-in agent to its shipped configuration. */
export function defaultAgentPatch(agentId) {
  const shipped = agentData.agents.find(a => a.id === agentId) || {};
  return {
    label: shipped.label, emoji: shipped.emoji, description: shipped.description,
    agentMd: shipped.agentMd, skillMd: shipped.skillMd, contextMd: shipped.contextMd,
    starters: shipped.starters || [], knowledge: [], knowledgeOnly: false,
  };
}

export const isBuiltinAgent = (agentId) => agentData.agents.some(a => a.id === agentId);

/** Creates a user-defined tool (Capability) for an agent. */
export function createCustomCapability(graph, { label, keywords, reply = '', prompt = '', agentId }) {
  const cap = graph.addEntity({
    id: newId('custom'), type: 'Capability', label, keywords, kind: prompt ? 'llm' : 'mock', reply, prompt,
    description: prompt ? `用户自定义 AI 能力：${prompt.slice(0, 60)}` : `用户自定义能力，返回：${reply.slice(0, 60)}`,
    enabled: true, priority: 10, agentId,
    params: { type: 'object', properties: { input: { type: 'string', description: '用户原始问题' } } },
  });
  graph.addTriple(cap.id, 'providedBy', agentId);
  return cap;
}

/* ------------------------------------------------------------------ */
/* Knowledge: files & URLs                                             */
/* ------------------------------------------------------------------ */

const extOf = (name) => (String(name).includes('.') ? String(name).split('.').pop().toLowerCase() : '');

function truncate(text) {
  const clean = String(text || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { content: clean.slice(0, KNOWLEDGE_LIMITS.maxCharsPerItem), truncated: clean.length > KNOWLEDGE_LIMITS.maxCharsPerItem };
}

/** Extracts readable text from HTML without executing it. */
export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script, style, noscript, template, svg, iframe').forEach(n => n.remove());
  return { title: (doc.title || '').trim(), text: (doc.body?.textContent || '').replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim() };
}

export function knowledgeChars(knowledge) {
  return (knowledge || []).reduce((sum, k) => sum + (k.content ? k.content.length : 0), 0);
}

/** Reads an uploaded file into a knowledge item (text formats are indexed). */
export async function readKnowledgeFile(file) {
  const ext = extOf(file.name);
  const base = {
    id: newId('kn'), kind: 'file', name: file.name, size: file.size, mime: file.type || '', addedAt: new Date().toISOString(),
  };
  const isText = TEXT_FILE_EXTENSIONS.includes(ext) || file.type.startsWith('text/');
  if (!isText) return { ...base, status: 'reference', note: '该格式暂不支持在浏览器中解析，仅记录文件信息' };
  if (file.size > KNOWLEDGE_LIMITS.maxFileBytes) return { ...base, status: 'reference', note: '文件过大，仅记录文件信息' };
  const raw = await file.text();
  const text = ['html', 'htm'].includes(ext) ? htmlToText(raw).text : raw;
  return { ...base, status: 'indexed', ...truncate(text) };
}

/** Returns a URL object for http(s) URLs, otherwise null. */
export function parseHttpUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  return ['http:', 'https:'].includes(url.protocol) ? url : null;
}

/**
 * Turns a web address into a knowledge item. The page is fetched directly
 * from the browser when CORS allows it; otherwise it is kept as a reference
 * URL that is passed to the AI model.
 */
export async function fetchUrlKnowledge(raw) {
  const url = parseHttpUrl(raw);
  if (!url) throw new Error('请输入以 http:// 或 https:// 开头的网址');
  const base = {
    id: newId('kn'), kind: 'url', name: `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`, url: url.href,
    addedAt: new Date().toISOString(),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KNOWLEDGE_LIMITS.fetchTimeoutMs);
  try {
    const res = await fetch(url.href, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (!/text\/|json|xml/.test(type)) return { ...base, status: 'reference', note: `内容类型 ${type || '未知'} 暂不支持解析，作为参考网址使用` };
    const body = await res.text();
    const { title, text } = /html/.test(type) ? htmlToText(body) : { title: '', text: body };
    return { ...base, name: title || base.name, status: 'indexed', ...truncate(text) };
  } catch {
    return { ...base, status: 'reference', note: '浏览器无法直接抓取（可能受跨域限制），将作为参考网址提供给 AI' };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Using the configuration                                             */
/* ------------------------------------------------------------------ */

/** Builds the system prompt for an agent from its configuration. */
export function buildAgentPrompt(config, { maxKnowledgeChars = 12000 } = {}) {
  const parts = [`你是家庭助手中的「${config.emoji} ${config.label}」${config.description ? `：${config.description}` : ''}。`];
  if (config.agentMd.trim()) parts.push(`## Agent.md（指令）\n${config.agentMd.trim()}`);
  if (config.skillMd.trim()) parts.push(`## Skill.md（技能）\n${config.skillMd.trim()}`);
  if (config.contextMd.trim()) parts.push(`## Context.md（上下文）\n${config.contextMd.trim()}`);

  let budget = maxKnowledgeChars;
  const docs = [];
  config.knowledge.filter(k => k.content).forEach(k => {
    if (budget <= 0) return;
    const slice = k.content.slice(0, budget);
    budget -= slice.length;
    docs.push(`### ${k.name}${k.url ? `（${k.url}）` : ''}\n${slice}`);
  });
  if (docs.length) parts.push(`## 知识库\n${docs.join('\n\n')}`);
  const refs = config.knowledge.filter(k => !k.content);
  if (refs.length) parts.push(`## 参考资料（仅名称/网址）\n${refs.map(k => `- ${k.name}${k.url ? `：${k.url}` : ''}`).join('\n')}`);
  if (config.knowledgeOnly) parts.push('只能依据上述指令、上下文与知识库回答；如果资料中没有答案，请直接说明不知道，不要编造。');
  parts.push('使用中文回答，简洁、友好。健康相关建议仅供参考，不能替代医生意见。');
  return parts.join('\n\n');
}

const STOP_WORDS = /什么|怎么|如何|一下|可以|有没有|哪些|是否|请问|帮我|我们|你们|给我|告诉我|吗|呢|吧|啊|的|了|和|是/g;

/** Simple local retrieval over Context.md and indexed knowledge (Chinese bigrams + latin words). */
export function searchKnowledge(config, query, limit = 3) {
  const q = String(query || '').toLowerCase().replace(STOP_WORDS, ' ');
  const terms = new Set();
  q.split(/[^\p{L}\p{N}]+/u).filter(Boolean).forEach(chunk => {
    if (/^[a-z0-9]+$/.test(chunk)) {
      if (chunk.length > 1) terms.add(chunk);
      return;
    }
    if (chunk.length === 1) return;
    for (let i = 0; i < chunk.length - 1; i++) terms.add(chunk.slice(i, i + 2));
  });
  if (!terms.size) return [];
  const sources = [
    { name: 'Context.md', content: config.contextMd },
    ...config.knowledge.filter(k => k.content).map(k => ({ name: k.name, content: k.content })),
  ];
  const hits = [];
  sources.forEach(src => {
    String(src.content || '').split(/\n+/).map(s => s.trim()).filter(s => s.length >= 4).forEach(text => {
      const lower = text.toLowerCase();
      let score = 0;
      terms.forEach(t => { if (lower.includes(t)) score += 1; });
      if (score > 0) hits.push({ source: src.name, text, score });
    });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Answers a free-form question as the given agent. Uses the AI model with
 * the agent's configuration when available, otherwise local retrieval.
 */
export async function consultAgent(config, question, { context = '' } = {}) {
  if (isAIConfigured()) {
    const system = [buildAgentPrompt(config), context].filter(Boolean).join('\n\n');
    const msg = await chatCompletion({ messages: [{ role: 'system', content: system }, { role: 'user', content: question }] });
    return { reply: String(msg.content || '').trim() || '（AI 没有返回内容）', mode: 'llm' };
  }
  const hits = searchKnowledge(config, question);
  if (hits.length) {
    return {
      mode: 'local',
      reply: `${config.emoji} 本地模式：在「${config.label}」的知识中找到相关内容：\n${hits.map(h => `• 【${h.source}】${h.text.slice(0, 160)}`).join('\n')}\n\n配置 AI Key 后，可基于 Agent.md / Skill.md / Context.md 与知识库生成完整回答。`,
    };
  }
  return {
    mode: 'local',
    reply: `${config.emoji} 「${config.label}」在本地模式下没有找到相关资料。可以在 Agent 配置中补充 Context.md、上传文件或添加网址，或配置 AI Key 获得完整回答。${config.starters.length ? `\n也可以试试：${config.starters.map(s => `“${s}”`).join('、')}` : ''}`,
  };
}
