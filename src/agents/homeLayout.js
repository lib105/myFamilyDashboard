/**
 * Home-page agent: understands layout commands such as “隐藏家庭档案” or
 * “把超市打折信息放到最上面” and turns them into layout changes.
 *
 * Layout state: { hidden: string[], pinned: string[] } where entries are module ids
 * (= home view types); `pinned` is ordered, most recently pinned first.
 */

/** Order matters: more specific patterns first, matched text is consumed. */
export const HOME_MODULES = [
  { id: 'profiles', label: '家庭档案', re: /家庭档案|健康档案|成员档案|家人档案|档案/, capabilityId: 'view_family_profile' },
  { id: 'weather', label: '天气', re: /天气预报|天气/, capabilityId: 'query_weather' },
  { id: 'discounts', label: '打折信息', re: /(超市|App|app)?(打折|折扣|优惠|促销|满减)(信息)?/, capabilityId: 'query_app_discounts' },
  { id: 'prices', label: '超市比价', re: /(超市)?(比价|价格)|超市/, capabilityId: 'query_supermarket_price' },
  { id: 'reminders', label: '健康提醒', re: /(健康)?提醒/, capabilityId: 'health_reminders' },
  { id: 'health', label: '健康概览', re: /健康/, capabilityId: 'health_overview' },
  { id: 'recipes', label: '食谱推荐', re: /食谱|菜谱|菜单/, capabilityId: 'recommend_recipes' },
  { id: 'ingredient_info', label: '食材数据', re: /食材数据|食材资料|食材介绍/ },
  { id: 'produce', label: '当季食材', re: /当季|食材|水果|蔬菜/, capabilityId: 'recommend_produce' },
  { id: 'tasks', label: '家庭任务', re: /任务/, capabilityId: 'list_tasks' },
  { id: 'trips', label: '旅行计划', re: /旅行|旅游|行程|出行/, capabilityId: 'list_trips' },
  { id: 'order', label: '采购订单', re: /订单/ },
  { id: 'delivery', label: '物流快递', re: /快递|物流/, capabilityId: 'track_delivery' },
  { id: 'capabilities', label: '能力清单', re: /能力/, capabilityId: 'manage_capabilities', args: { action: 'list' } },
];
export const MODULE_IDS = HOME_MODULES.map(m => m.id);
const byId = Object.fromEntries(HOME_MODULES.map(m => [m.id, m]));
export const moduleLabel = (id) => byId[id]?.label || id;
export const moduleOf = (id) => byId[id];

const RESET_RE = /(恢复|重置|还原)(成|为|到)?(默认)?(的)?(首页)?(布局|排版|排列)|(显示|展示)(全部|所有)(模块|卡片)?|(全部|所有)(模块|卡片)?(都)?(显示|展示)|取消(所有|全部)隐藏/;
const PIN_RE = /置顶|置于?(最)?(上|顶|前)|(放|移|挪|排|调)(到|在|至)?(最)?(上面|上方|顶部|顶上|最上|最前|前面|第一)|排(在)?第一|优先(显示|展示)/;
const HIDE_RE = /隐藏|收起|关掉|关闭|不要(再)?(显示|展示)|不(用|再)?(显示|展示)|不想看|去掉|移除|藏起来|折叠/;
const SHOW_RE = /显示|展示|打开|展开|恢复|取消隐藏|调出/;
const MAX_COMMAND_LENGTH = 40;

export function findModules(text) {
  let rest = String(text || '');
  const found = [];
  HOME_MODULES.forEach(m => {
    if (!m.re.test(rest)) return;
    found.push(m.id);
    rest = rest.replace(new RegExp(m.re.source, 'g'), ' ');
  });
  return found;
}

/** “隐藏家庭档案” → { action: 'hide', modules: ['profiles'] }; null when the text is not a layout command. */
export function parseLayoutCommand(text) {
  const t = String(text || '').trim();
  if (!t || t.length > MAX_COMMAND_LENGTH) return null;
  if (RESET_RE.test(t)) return { action: 'reset', modules: [] };
  const action = PIN_RE.test(t) ? 'pin' : HIDE_RE.test(t) ? 'hide' : SHOW_RE.test(t) ? 'show' : null;
  if (!action) return null;
  const modules = findModules(t);
  return modules.length ? { action, modules } : null;
}

export const normalizeLayoutCommand = (cmd) => {
  const action = ['hide', 'show', 'pin', 'reset'].includes(cmd?.action) ? cmd.action : null;
  if (!action) return null;
  const modules = [...new Set((Array.isArray(cmd.modules) ? cmd.modules : []).filter(id => byId[id]))];
  return action === 'reset' || modules.length ? { action, modules } : null;
};

export function describeLayoutCommand({ action, modules }) {
  const names = modules.map(moduleLabel).join('、');
  switch (action) {
    case 'hide': return `🙈 已隐藏「${names}」。想再看到时说“显示${moduleLabel(modules[0])}”即可。`;
    case 'show': return `👀 已显示「${names}」。`;
    case 'pin': return `📌 已将「${names}」置于页面最上方。`;
    default: return '🔄 已恢复默认首页布局，所有模块均已显示。';
  }
}

export const EMPTY_LAYOUT = { hidden: [], pinned: [] };
const without = (list, ids) => list.filter(x => !ids.includes(x));

export function applyLayoutCommand(layout, { action, modules }) {
  const { hidden, pinned } = { ...EMPTY_LAYOUT, ...layout };
  switch (action) {
    case 'hide': return { hidden: [...without(hidden, modules), ...modules], pinned: without(pinned, modules) };
    case 'show': return { hidden: without(hidden, modules), pinned };
    case 'pin': return { hidden: without(hidden, modules), pinned: [...modules, ...without(pinned, modules)] };
    case 'reset': return { ...EMPTY_LAYOUT };
    default: return layout;
  }
}

/** Modules the user just asked about become visible again. */
export function revealModules(layout, ids) {
  const shown = ids.filter(id => layout.hidden.includes(id));
  return shown.length ? { ...layout, hidden: without(layout.hidden, shown) } : layout;
}

/** Visible views ordered with pinned modules first (stable otherwise). */
export function arrangeViews(views, layout) {
  const rank = (v) => {
    const i = layout.pinned.indexOf(v.type);
    return i < 0 ? layout.pinned.length : i;
  };
  return views
    .filter(v => !layout.hidden.includes(v.type))
    .map((v, i) => ({ v, i }))
    .sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i)
    .map(x => x.v);
}

/** Tool definition so the LLM router can also drive the home layout. */
export const ARRANGE_HOME_TOOL = 'arrange_home';
export const arrangeHomeTool = () => ({
  type: 'function',
  function: {
    name: ARRANGE_HOME_TOOL,
    description: `[🏠 首页 Agent] 调整首页卡片布局：隐藏(hide)/显示(show)/置顶(pin)模块，或恢复默认布局(reset)。例如“隐藏家庭档案”“把超市打折信息放到最上面”。模块：${HOME_MODULES.map(m => `${m.id}(${m.label})`).join('、')}`,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['hide', 'show', 'pin', 'reset'] },
        modules: { type: 'array', items: { type: 'string', enum: MODULE_IDS } },
      },
      required: ['action'],
    },
  },
});
