const VIEWS_KEY = 'family-dashboard.home-views.v1';
const CHAT_KEY = 'family-dashboard.chat.v1';
const MAX_VIEWS = 10;
const MAX_MESSAGES = 60;

export const DEFAULT_VIEWS = [
  { id: 'default-produce', type: 'produce', title: '当季推荐食材', args: { category: 'all' }, capabilityId: 'recommend_produce' },
  { id: 'default-recipes', type: 'recipes', title: '简单食谱推荐', args: {}, capabilityId: 'recommend_recipes' },
  { id: 'default-tasks', type: 'tasks', title: '家庭任务', args: {}, capabilityId: 'list_tasks' },
  { id: 'default-reminders', type: 'reminders', title: '健康提醒', args: {}, capabilityId: 'health_reminders' },
  { id: 'default-trips', type: 'trips', title: '家庭旅行计划', args: {}, capabilityId: 'list_trips' },
];

const read = (key, fallback) => {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) || 'null');
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};

export const loadViews = () => read(VIEWS_KEY, DEFAULT_VIEWS);
export const saveViews = (views) => write(VIEWS_KEY, views);
export const loadMessages = () => read(CHAT_KEY, []);
export const saveMessages = (messages) => write(CHAT_KEY, messages.slice(-MAX_MESSAGES));

const viewKey = (v) => [
  v.type,
  v.type === 'text' ? v.capabilityId : '',
  v.type === 'order' ? v.args?.orderId : '',
  ['produce', 'recipes', 'trips', 'health'].includes(v.type) ? JSON.stringify(v.args || {}) : '',
].join(':');

let seq = 0;
export const stampViews = (views) => views.map(v => ({ ...v, id: `${Date.now().toString(36)}-${(seq++).toString(36)}`, updatedAt: Date.now() }));

/** Newly produced (stamped) views replace views of the same kind and move to the top. */
export function mergeViews(current, stamped) {
  const keys = new Set(stamped.map(viewKey));
  return [...stamped, ...current.filter(v => !keys.has(viewKey(v)))].slice(0, MAX_VIEWS);
}

const ANSWER_KEY = 'family-dashboard.current-answer.v1';

/** The latest Q&A shown in the centre of the home page: { question, reply, trace, mode, viewIds, at }. */
export function loadAnswer() {
  try {
    const v = JSON.parse(window.localStorage.getItem(ANSWER_KEY) || 'null');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
export function saveAnswer(answer) {
  try {
    if (answer) window.localStorage.setItem(ANSWER_KEY, JSON.stringify(answer));
    else window.localStorage.removeItem(ANSWER_KEY);
  } catch {
    /* ignore */
  }
}
