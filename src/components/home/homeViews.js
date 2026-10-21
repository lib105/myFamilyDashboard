const VIEWS_KEY = 'family-dashboard.home-views.v2';
/** v1 stored views without the weather / profiles cards (they used to be fixed page sections). */
const LEGACY_VIEWS_KEY = 'family-dashboard.home-views.v1';
const CHAT_KEY = 'family-dashboard.chat.v1';
const MAX_VIEWS = 12;
const MAX_MESSAGES = 60;

export const DEFAULT_VIEWS = [
  { id: 'default-weather', type: 'weather', title: '今日天气', args: {}, capabilityId: 'query_weather' },
  { id: 'default-profiles', type: 'profiles', title: '家庭档案', args: {}, capabilityId: 'view_family_profile' },
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

export function loadViews() {
  const views = read(VIEWS_KEY, null);
  if (views) return views;
  const legacy = read(LEGACY_VIEWS_KEY, null);
  if (!legacy) return DEFAULT_VIEWS;
  const added = DEFAULT_VIEWS.filter(d => ['weather', 'profiles'].includes(d.type) && !legacy.some(v => v.type === d.type));
  return [...added, ...legacy].slice(0, MAX_VIEWS);
}
export const saveViews = (views) => write(VIEWS_KEY, views);
export const loadMessages = () => read(CHAT_KEY, []);
export const saveMessages = (messages) => write(CHAT_KEY, messages.slice(-MAX_MESSAGES));

const viewKey = (v) => ['produce', 'recipes'].includes(v.type) ? JSON.stringify([
  v.type,
  [...(v.args?.memberIds || [])].sort(),
  v.type === 'produce' ? v.args?.category || 'all' : v.args?.mealType || '',
]) : [
  v.type,
  v.type === 'text' ? v.capabilityId : '',
  v.type === 'order' ? v.args?.orderId : '',
  ['trips', 'health'].includes(v.type) ? JSON.stringify(v.args || {}) : '',
].join(':');

let seq = 0;
export const stampViews = (views) => views.map(v => ({ ...v, id: `${Date.now().toString(36)}-${(seq++).toString(36)}`, updatedAt: Date.now() }));

/** Newly produced (stamped) views replace views of the same kind and move to the top. */
export function mergeViews(current, stamped) {
  const keys = new Set();
  return [...stamped, ...current].filter(v => {
    const key = viewKey(v);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  }).slice(0, MAX_VIEWS);
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

const LAYOUT_KEY = 'family-dashboard.home-layout.v1';

/** Home-agent layout: { hidden: moduleId[], pinned: moduleId[] }. */
export function loadLayout() {
  try {
    const v = JSON.parse(window.localStorage.getItem(LAYOUT_KEY) || 'null');
    const list = (x) => (Array.isArray(x) ? x.filter(s => typeof s === 'string') : []);
    return { hidden: list(v?.hidden), pinned: list(v?.pinned) };
  } catch {
    return { hidden: [], pinned: [] };
  }
}
export const saveLayout = (layout) => write(LAYOUT_KEY, layout);
