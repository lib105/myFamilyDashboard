import { newId } from '../ontology/queries.js';

const BRAND_ALIASES = [
  ['伊利', /伊利/i], ['蒙牛', /蒙牛/i], ['光明', /光明/i], ['三元', /三元/i],
  ['认养一头牛', /认养一头牛/i], ['安佳', /安佳|anchor/i], ['燕塘', /燕塘/i], ['晨光', /晨光/i],
  ['捷安特', /捷安特|giant/i], ['美利达', /美利达|merida/i], ['迪卡侬', /迪卡侬|decathlon/i],
  ['崔克', /崔克|trek/i], ['闪电', /闪电|specialized/i], ['喜德盛', /喜德盛|xds/i],
];
export const shoppingBrand = text => {
  const found = BRAND_ALIASES.filter(([, re]) => re.test(text));
  return found.length === 1 ? found[0][0] : undefined;
};
const any = '不限';
const active = request => request?.type === 'ShoppingRequest' && ['collecting', 'ready'].includes(request.status);

export function isShoppingIntent(text) {
  // If the user is specifically targeting offline supermarkets (Walmart, BiYouTe, CR Vanguard),
  // let supermarket price comparison handle it, not JD ecommerce.
  if (/(?:沃尔玛|比优特|华润万家)/.test(text)) return false;
  return /京东|淘宝|天猫|\bjd(?:\.com)?\b|taobao|tmall|(?:我想|想|准备|打算|帮我)?买(?:一辆|一台|一箱|点|个)?|商品(?:搜索|比价)|(?:搜索|找|比较).*(?:牛奶|自行车)|(?:牛奶|自行车).*比价/i.test(text)
    && !/^(?:请)?(?:隐藏|显示|置顶|收起|关闭|打开|恢复)/.test(text);
}

export function cleanShoppingQuery(text) {
  return String(text).trim()
    .replace(/先直接搜|直接搜索|直接比价|不用再问/g, '')
    .replace(/[，,。]+$/, '')
    .replace(/^(?:请)?(?:帮我|帮忙|我想|准备|打算)?\s*/, '')
    .replace(/^(?:帮|给|为)(?:爸爸|妈妈|爷爷|奶奶|孩子)\s*/, '')
    .replace(/^(?:搜索|搜一下|查一下|查找|查询|看看|找一下|找|搜|想买|买|购买)\s*/, '')
    .replace(/^(?:在|去|到|用)?\s*(?:京东|淘宝|天猫|jd(?:\.com)?|taobao|tmall)(?:网站|商城|上)?\s*/i, '')
    .replace(/^(?:搜索|搜一下|查一下|查找|查询|看看|找一下|找|搜|查|买|购买)\s*/, '')
    .replace(/[，,]\s*(?:看看|查看|查询|查查)?(?:价格|价钱|优惠|折扣|打折|促销).*$/, '')
    .replace(/(?:的价格和优惠|价格和打折信息|价格和优惠|有什么打折信息|有哪些优惠|有什么优惠|有什么促销|的价格|的优惠|多少钱)\s*[？?。！!]*$/, '')
    .replace(/\s+(?:优惠|价格|折扣|打折信息)\s*[？?。！!]*$/, '')
    .replace(/京东|淘宝|天猫|\bjd(?:\.com)?\b|taobao|tmall/gi, ' ')
    .replace(/^(?:(?:在|去|到|用|和|与|及|比价|比较|对比|搜索|查找)\s*)+/, '')
    .replace(/[，,？?。！!]+$/, '').trim().slice(0, 180);
}

export function milkPack(text) {
  const value = text.toLowerCase();
  const bundles = [...value.matchAll(/(\d+)\s*(?:箱|件|提|组)/g)];
  // Multiple bundle counts / Chinese counts are ambiguous; never flatten them to one box.
  if (bundles.length > 1 || /[一二两三四五六七八九十]\s*(?:箱|件|提|组)/.test(value)) return null;
  const multiplier = bundles.length ? Number(bundles[0][1]) : 1;
  const adjacent = value.match(/(\d+(?:\.\d+)?)\s*(ml|毫升|l|升)\s*[x×*＊]?\s*(\d+)\s*(?:盒|瓶|袋|包|支|罐)/);
  if (adjacent) return { volumeMl: Number(adjacent[1]) * (['l', '升'].includes(adjacent[2]) ? 1000 : 1), count: Number(adjacent[3]) * multiplier };
  const volume = value.match(/(\d+(?:\.\d+)?)\s*(ml|毫升|l|升)(?![a-z])/);
  const count = value.match(/(?:[x×*＊]\s*(\d+)\s*(?:盒|瓶|袋|包|支|罐)?|(\d+)\s*(?:盒|瓶|袋|包|支|罐)(?:装)?)/);
  return volume && count ? { volumeMl: Number(volume[1]) * (['l', '升'].includes(volume[2]) ? 1000 : 1), count: Number(count[1] || count[2]) * multiplier } : null;
}

export function parseBudget(text, allowBare = false) {
  if (/预算不限|不限预算/.test(text) || (allowBare && /^(不限|都行|随便)$/.test(text))) return { budgetSpecified: true, minPrice: null, maxPrice: null };
  if (/美元|美金|欧元|英镑|\bUSD\b|\bEUR\b/i.test(text)) return { error: '当前预算仅支持人民币，请换算后填写元。' };
  if (/(?:^|预算\s*)-\s*\d/.test(text)) return { error: '预算不能为负数，请重新填写。' };
  const part = '(\\d+(?:\\.\\d+)?)\\s*(万|千|[kK])?';
  const money = (number, unit) => Number(number) * (unit === '万' ? 10000 : unit === '千' || /k/i.test(unit || '') ? 1000 : 1);
  const range = text.match(new RegExp(`${part}\\s*(?:-|~|～|至|到)\\s*${part}\\s*元`))
    || text.match(new RegExp(`预算\\s*${part}\\s*(?:-|~|～|至|到)\\s*${part}`))
    || (allowBare && text.match(new RegExp(`^${part}\\s*(?:-|~|～|至|到)\\s*${part}\\s*元?$`)));
  if (range) {
    if (!range[2] && range[4]) return { error: '区间两端请分别填写单位，或统一写成元，例如1000-2000元。' };
    const minPrice = money(range[1], range[2]), maxPrice = money(range[3], range[4]);
    return Number.isFinite(maxPrice) && minPrice <= maxPrice && maxPrice <= 100000000
      ? { budgetSpecified: true, minPrice, maxPrice } : { error: '预算范围无效：下限不能高于上限，金额须在合理范围内。' };
  }
  const cap = text.match(new RegExp(`${part}\\s*元?\\s*(?:以内|以下|封顶|预算上限)`))
    || text.match(new RegExp(`(?:不超过|最多|上限)\\s*${part}\\s*元?`))
    || text.match(new RegExp(`预算\\s*[:：]?\\s*${part}\\s*元?(?![\\d.a-zA-Z万千])`))
    || (allowBare && text.match(new RegExp(`^${part}\\s*元?$`)));
  if (cap) {
    const maxPrice = money(cap[1], cap[2]);
    return Number.isFinite(maxPrice) && maxPrice <= 100000000 && !/(?:^|预算\s*|不超过\s*)-\s*\d/.test(text)
      ? { budgetSpecified: true, minPrice: null, maxPrice } : { error: '请输入非负且合理的预算金额。' };
  }
  return null;
}

function categoryOf(text) {
  if (/牛奶|鲜奶|纯奶/.test(text)) return 'milk';
  if (/自行车|山地车|公路车|通勤车/.test(text)) return 'bicycle';
  return 'generic';
}
export function nextShoppingField(request) {
  if (request.category !== 'generic' && !request.variant) return 'variant';
  if (!request.brand) return 'brand';
  if (!request.spec) return 'spec';
  if (!request.budgetSpecified) return 'budget';
  return null;
}

function patchFromText(text, request, field) {
  const patch = {};
  const positive = text.replace(/(?:不要|不是|不想要|不选|不喝|排除)(?:常温牛奶|常温|冷藏鲜奶|冷藏|冰鲜|鲜奶|山地车|公路车)/g, '');
  const noLimit = /^(不限|都行|随便|没有要求|没要求|无偏好|都可以)$/.test(text) || /(?:品牌|规格|型号|尺码).*不限|不限(?:品牌|规格)|预算不限/.test(text);
  if (request.category === 'milk') {
    if (/常温|UHT/i.test(positive)) patch.variant = '常温牛奶';
    else if (/冷藏|冰鲜|巴氏|鲜牛奶/.test(positive)) patch.variant = '冷藏鲜奶';
    const pack = milkPack(text);
    if (pack) patch.spec = `${pack.volumeMl}ml×${pack.count}盒`;
  } else if (request.category === 'bicycle') {
    patch.variant = /山地车/.test(positive) ? '山地车' : /公路车/.test(positive) ? '公路车' : /通勤|城市车/.test(positive) ? '通勤自行车' : /儿童车/.test(positive) ? '儿童自行车' : undefined;
    if (!patch.variant) delete patch.variant;
    const model = text.match(/\b(?:ATX|XTC|RC|TCR|DOMANE|MARLIN)[ -]?\d+[a-z]*\b/i);
    if (model) {
      const sizes = [...text.matchAll(/\b(?:XS|S|M|L|XL|XXL)码|\d+(?:\.\d+)?寸|\b700[cC]\b/gi)].map(m => m[0]);
      patch.spec = [model[0], ...sizes].join(' ');
    }
  }
  const brand = shoppingBrand(text);
  if (brand) patch.brand = brand;
  const explicitBrand = text.match(/品牌\s*[:：]\s*([^，,。；;]+)/);
  if (explicitBrand) patch.brand = explicitBrand[1].trim().slice(0, 60);
  if (/品牌不限|不限品牌/.test(text)) patch.brand = any;
  if (/(?:规格|型号|尺码).*不限|不限规格/.test(text)) patch.spec = any;
  const budget = parseBudget(text, field === 'budget');
  if (budget?.error) return { error: budget.error };
  if (budget) Object.assign(patch, budget);
  if (field && noLimit && !Object.keys(patch).length) {
    if (field === 'budget') Object.assign(patch, { budgetSpecified: true, minPrice: null, maxPrice: null });
    else patch[field] = any;
  }
  if (field === 'brand' && !Object.keys(patch).length && text.length <= 60) patch.brand = text;
  if (field === 'spec' && !Object.keys(patch).length && text.length <= 100) patch.spec = text;
  return patch;
}

export function shoppingFollowUp(request) {
  const field = nextShoppingField(request);
  const questions = {
    variant: request.category === 'milk' ? ['牛奶想要冷藏鲜奶，还是常温牛奶？', ['冷藏鲜奶', '常温牛奶', '不限']]
      : ['自行车主要看哪种类型？', ['山地车', '公路车', '通勤自行车', '儿童自行车', '不限']],
    brand: ['品牌有偏好吗？也可以输入“品牌：你的品牌”。', request.category === 'bicycle' ? ['捷安特', '美利达', '迪卡侬', '品牌不限'] : request.category === 'milk' ? ['伊利', '蒙牛', '光明', '品牌不限'] : ['品牌不限']],
    spec: [request.category === 'milk' ? '每盒容量、每箱盒数有要求吗？同规格才方便比价。' : '型号、尺寸或包装规格有要求吗？', request.category === 'milk' ? ['250ml×24盒', '200ml×24盒', '规格不限'] : ['型号/尺码不限']],
    budget: ['预算大约多少？这是每件/每箱展示价范围，优惠和运费条件需另行核实。', request.category === 'bicycle' ? ['1000-3000元', '3000-6000元', '预算不限'] : ['100元以内', '100-200元', '预算不限']],
  };
  if (!field) return null;
  const [question, options] = questions[field];
  return { field, question, options: [...options, '先直接搜', '取消采购'] };
}
const resultFor = (request, error = '') => {
  const followUp = shoppingFollowUp(request);
  return { reply: [error, request.platformNotice, followUp?.question, '仅查询京东，优先查看自营/旗舰店；不会自动购买。'].filter(Boolean).join('\n'), followUp,
    shoppingRequestId: request.id, shoppingClarification: true, views: [], trace: [], mode: 'local', layout: null, unanswered: null };
};

/** Typed, per-conversation shopping state. Never guess that an absent answer means “不限”. */
export function prepareShoppingTurn(text, { graph, requestId, force = false, sites } = {}) {
  const old = requestId && graph.getEntity(requestId);
  let pending = active(old) ? old : null;
  const disabledNotice = '淘宝/天猫搜索已取消，目前仅支持京东商品搜索。';
  const disabledResult = () => ({ result: pending ? resultFor(pending, disabledNotice) : {
    reply: disabledNotice, shoppingRequestId: null, shoppingClarification: true,
    views: [], trace: [], mode: 'local', layout: null, unanswered: null,
  } });
  if (pending && pending.sites.some(id => id !== 'site_jd')) {
    if (!pending.sites.includes('site_jd')) {
      graph.updateEntity(pending.id, { status: 'cancelled' });
      pending = null;
      return disabledResult();
    }
    pending = graph.updateEntity(pending.id, { sites: ['site_jd'], platformNotice: disabledNotice });
  }
  const mentionsRemovedSite = /淘宝|天猫|taobao|tmall/i.test(text);
  if ((mentionsRemovedSite && !/京东|\bjd(?:\.com)?\b/i.test(text)) || sites?.some(id => id !== 'site_jd')) return disabledResult();
  if (pending && /^(取消采购|取消比价|不买了|不找了|取消)$/.test(text.trim())) {
    graph.updateEntity(pending.id, { status: 'cancelled' });
    return { result: { reply: '已取消这次采购，没有执行浏览器操作。', views: [], trace: [], mode: 'local', layout: null, unanswered: null, shoppingRequestId: null, shoppingClarification: true } };
  }
  const intent = isShoppingIntent(text) || force;
  if (!intent && !pending) return null;
  if (!intent && /天气|视频|任务|提醒|档案|健康状况|旅行|你能做什么/.test(text)) return null;
  const cap = graph.getEntity('search_products_with_browser');
  if (!cap || cap.enabled === false) return { result: { reply: '商品搜索能力未启用，未执行浏览器操作，也未替换为模拟报价。', views: [], trace: [], mode: 'local', layout: null, unanswered: null } };
  let request = pending;
  if (!pending || (intent && !force)) {
    if (pending) graph.updateEntity(pending.id, { status: 'cancelled' });
    const keywords = cleanShoppingQuery(text);
    if (!keywords) return { result: { reply: '想搜索什么商品？例如“我想买牛奶”或“在京东找自行车”。', views: [], trace: [], mode: 'local', layout: null, unanswered: null, shoppingClarification: true, shoppingRequestId: null } };
    request = graph.addEntity({ id: newId('shopping'), type: 'ShoppingRequest', keywords, category: categoryOf(text), sites: ['site_jd'], platformNotice: mentionsRemovedSite ? disabledNotice : '',
      variant: null, brand: null, spec: null, budgetSpecified: false, minPrice: null, maxPrice: null,
      status: 'collecting', createdAt: new Date().toISOString() });
  }
  const field = pending && request.id === pending.id ? nextShoppingField(request) : null;
  const fastSearch = /先直接搜|直接搜索|直接比价|不用再问/.test(text);
  const patch = patchFromText(text.trim(), request, fastSearch ? null : field);
  if (patch.error) return { result: resultFor(request, patch.error) };
  request = graph.updateEntity(request.id, patch);
  if (fastSearch) {
    request = graph.updateEntity(request.id, { variant: request.variant || any, brand: request.brand || any, spec: request.spec || any,
      budgetSpecified: true, minPrice: request.minPrice, maxPrice: request.maxPrice });
  }
  if (nextShoppingField(request)) return { result: resultFor(request) };
  request = graph.updateEntity(request.id, { status: 'ready' });
  return { request };
}

export function shoppingSearchQuery(request) {
  const keywords = request.keywords.replace(/(?:预算\s*)?\d+(?:\.\d+)?\s*(?:万|千|k)?\s*(?:-|~|～|至|到)\s*\d+(?:\.\d+)?\s*(?:万|千|k)?\s*元/gi, '')
    .replace(/预算\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:万|千|k)?(?:\s*(?:-|~|～|至|到)\s*\d+(?:\.\d+)?\s*(?:万|千|k)?)?\s*元?(?:以内|以下)?/gi, '')
    .replace(/\d+(?:\.\d+)?\s*(?:万|千|k)?\s*元?\s*(?:以内|以下)/gi, '')
    .replace(/品牌不限|不限品牌|规格不限|型号\/尺码不限|预算不限/g, '').trim();
  const parts = [request.variant, request.brand, request.spec, keywords].filter(part => part && part !== any);
  return parts.reduce((query, part) => query.includes(part) ? query : `${query} ${part}`.trim(), '').slice(0, 200);
}
