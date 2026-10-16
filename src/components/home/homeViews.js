const VIEWS_KEY = 'family-dashboard.home-views.v1';
const CHAT_KEY = 'family-dashboard.chat.v1';
const MAX_VIEWS = 10;
const MAX_MESSAGES = 60;

export const DEFAULT_VIEWS = [
  { id: 'default-produce', type: 'produce', title: '当季推荐食材', args: { category: 'all' }, capabilityId: 'recommend_produce' },
  { id: 'default-recipes', type: 'recipes', title: '简单食谱推荐', args: {}, capabilityId: 'recommend_recipes' },
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
  ['produce', 'recipes'].includes(v.type) ? JSON.stringify(v.args || {}) : '',
].join(':');

let seq = 0;
export const stampViews = (views) => views.map(v => ({ ...v, id: `${Date.now().toString(36)}-${(seq++).toString(36)}`, updatedAt: Date.now() }));

/** Newly produced (stamped) views replace views of the same kind and move to the top. */
export function mergeViews(current, stamped) {
  const keys = new Set(stamped.map(viewKey));
  return [...stamped, ...current.filter(v => !keys.has(viewKey(v)))].slice(0, MAX_VIEWS);
}
