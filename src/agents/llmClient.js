/**
 * Minimal OpenAI-compatible Chat Completions client. The user configures the
 * endpoint and model (kept in localStorage). The API key is kept only in
 * sessionStorage (cleared when the browser closes) unless the user explicitly
 * opts in to remembering it on this device.
 */

const SETTINGS_KEY = 'family-dashboard.ai-settings.v1';
const KEY_STORAGE_KEY = 'family-dashboard.ai-key.v1';

export const PROVIDER_PRESETS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'qwen', label: '通义千问（DashScope 兼容模式）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'moonshot', label: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { id: 'custom', label: '自定义（OpenAI 兼容）', baseUrl: '', model: '' },
];

export const DEFAULT_SETTINGS = {
  provider: 'openai', baseUrl: PROVIDER_PRESETS[0].baseUrl, model: PROVIDER_PRESETS[0].model,
  apiKey: '', enabled: true, rememberKey: false,
};

function readKey() {
  try {
    return window.sessionStorage.getItem(KEY_STORAGE_KEY) || window.localStorage.getItem(KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function loadAISettings() {
  let saved = {};
  try {
    saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    /* ignore */
  }
  delete saved.apiKey;
  return { ...DEFAULT_SETTINGS, ...saved, apiKey: readKey() };
}

export function saveAISettings(settings) {
  const { apiKey, ...rest } = settings;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
  window.sessionStorage.removeItem(KEY_STORAGE_KEY);
  window.localStorage.removeItem(KEY_STORAGE_KEY);
  if (!apiKey) return;
  // The key is only persisted beyond this browser session on explicit opt-in.
  (settings.rememberKey ? window.localStorage : window.sessionStorage).setItem(KEY_STORAGE_KEY, apiKey);
}

export function clearAISettings() {
  window.localStorage.removeItem(SETTINGS_KEY);
  window.localStorage.removeItem(KEY_STORAGE_KEY);
  window.sessionStorage.removeItem(KEY_STORAGE_KEY);
}

/** Only HTTPS endpoints (or plain HTTP on localhost) are accepted. */
export function validateBaseUrl(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return 'Base URL 格式不正确';
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    return '出于安全考虑，仅支持 https 地址（本机调试可用 http://localhost）';
  }
  return null;
}

export function isAIConfigured(settings = loadAISettings()) {
  return Boolean(settings.enabled && settings.apiKey && settings.model && !validateBaseUrl(settings.baseUrl));
}

export async function chatCompletion({ messages, tools, settings = loadAISettings(), signal }) {
  const urlError = validateBaseUrl(settings.baseUrl);
  if (urlError) throw new Error(urlError);
  const endpoint = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body = { model: settings.model, messages, temperature: 0.3 };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message || '';
    } catch {
      /* ignore */
    }
    throw new Error(`AI 接口返回 ${res.status}${detail ? `：${detail}` : ''}`);
  }
  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  if (!message) throw new Error('AI 接口未返回内容');
  return message;
}

/** Extracts the first JSON object/array from an LLM text answer. */
export function parseJsonFromText(text) {
  const s = String(text || '');
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : s;
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  for (let end = candidate.length; end > start; end--) {
    try {
      return JSON.parse(candidate.slice(start, end));
    } catch {
      /* keep shrinking */
    }
  }
  return null;
}
