import { shoppingBrand, milkPack } from './shoppingRequirements.js';

export function storeEvidence(product) {
  if (product.siteId === 'site_jd' && product.badges?.some(t => t === '自营' || t === '京东自营')) return { preferred: true, rank: 0, label: '页面自营标识', basis: 'badge' };
  if (/旗舰店/.test(product.shop || '')) return { preferred: true, rank: 1, label: '店名标注旗舰店（认证未独立核验）', basis: 'shop_name' };
  if (new URL(product.url).hostname === 'detail.tmall.com') return { preferred: true, rank: 2, label: '天猫渠道（依据商品域名）', basis: 'domain' };
  if (product.siteId === 'site_jd' && /京东自营/.test(product.shop || '')) return { preferred: true, rank: 3, label: '店名标注京东自营（需核实标识）', basis: 'shop_name' };
  return { preferred: false, rank: 9, label: '店铺类型未核实', basis: 'unknown' };
}

/** A partially masked/range/“起” price is not a usable number, and is never decoded or guessed. */
export function observedPrice(product) {
  if (product.priceCheckStatus === 'reference_only') return null;
  const value = (product.priceText || '').replace(/[¥￥,，\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || /起|区间/.test(product.priceNote || '')) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
const variantOf = title => /常温|uht/i.test(title) ? '常温牛奶' : /冷藏|冰鲜|巴氏|鲜牛奶/.test(title) ? '冷藏鲜奶' : null;
const modelOf = title => {
  const matches = [...title.matchAll(/\b(?:ATX|XTC|RC|TCR|DOMANE|MARLIN)[ -]?\d+[a-z]*\b/gi)].map(m => m[0].replace(/\s/g, '').toUpperCase());
  return new Set(matches).size === 1 ? matches[0] : null;
};
const frameOf = title => title.match(/\b(?:XS|S|M|L|XL|XXL)码|(?:车架|架高)\s*\d+(?:\.\d+)?寸/i)?.[0]?.replace(/\s/g, '').toUpperCase() || null;
const wheelOf = title => title.match(/\b700c\b|(?:26|27\.5|29|20|24)寸/i)?.[0]?.toUpperCase() || null;
function facts(product, category) {
  const title = product.title;
  const attributes = category === 'milk'
    ? [/非有机/.test(title) ? '非有机' : /有机/.test(title) ? '有机' : '', /A2/i.test(title) ? 'A2' : '',
      /无乳糖|零乳糖|0乳糖/.test(title) ? '无乳糖' : '', /高钙/.test(title) ? '高钙' : '',
      title.match(/全脂|低脂|脱脂/)?.[0] || '',
      title.match(/\d+(?:\.\d+)?g(?:乳)?蛋白|(?:乳)?蛋白\d+(?:\.\d+)?g/i)?.[0] || '']
    : [title.match(/\d+速/)?.[0] || '', title.match(/20\d{2}款/)?.[0] || ''];
  return { brand: shoppingBrand(title), pack: category === 'milk' ? milkPack(title) : null,
    series: ['特仑苏', '金典', '舒化', '优倍', '臻浓', '娟姗'].find(v => title.includes(v)) || null,
    variant: category === 'milk' ? variantOf(title) : /山地车/.test(title) ? '山地车' : /公路车/.test(title) ? '公路车' : null,
    model: modelOf(title), frame: frameOf(title), wheel: wheelOf(title), attributes: attributes.filter(Boolean).sort().join('|'),
    ambiguous: /随机|混合|多规格|可选|下拉|跳转|买.*送|赠/.test(title) };
}

export function evaluateProduct(product, request) {
  const f = facts(product, request.category);
  const issues = [], excluded = [];
  if (request.brand && request.brand !== '不限') {
    if (!product.title.toLowerCase().includes(request.brand.toLowerCase()) && f.brand !== request.brand) excluded.push('标题未匹配指定品牌');
  }
  if (request.variant && request.variant !== '不限') {
    if (f.variant && f.variant !== request.variant) excluded.push('类型不符');
    else if (!f.variant) issues.push('类型未从标题核实');
  }
  const expected = request.category === 'milk' && request.spec !== '不限' ? milkPack(request.spec || '') : null;
  if (expected && f.pack && (expected.volumeMl !== f.pack.volumeMl || expected.count !== f.pack.count)) excluded.push('容量或包装数量不符');
  else if (expected && !f.pack) issues.push('包装规格未核实');
  if (request.category === 'bicycle' && request.spec && request.spec !== '不限') {
    const model = modelOf(request.spec), frame = frameOf(request.spec), wheel = wheelOf(request.spec);
    if (model && f.model && model !== f.model) excluded.push('指定型号不符');
    else if (model && !f.model) issues.push('指定型号未核实');
    if (frame && f.frame && frame !== f.frame) excluded.push('指定车架尺码不符');
    else if (frame && !f.frame) issues.push('车架尺码未核实');
    if (wheel && f.wheel && wheel !== f.wheel) excluded.push('指定轮径不符');
    else if (wheel && !f.wheel) issues.push('轮径未核实');
  }
  const price = observedPrice(product);
  if (price === null) issues.push(product.priceCheckStatus === 'reference_only' ? '仅取得公开参考价，优惠价未核实，不能计算价差' : '完整价格未取得，不能计算价差');
  else if ((request.minPrice != null && price < request.minPrice) || (request.maxPrice != null && price > request.maxPrice)) excluded.push('页面展示价不在预算范围');
  if (f.ambiguous) issues.push('标题存在随机/多规格/跳转信息');
  return { product, facts: f, price, issues, excluded, store: storeEvidence(product) };
}

function comparePair(a, b, category) {
  const reasons = [];
  let level = 'similar';
  if (category === 'milk') {
    const x = a.facts.pack, y = b.facts.pack;
    if (!x || !y) reasons.push('容量或盒数缺失');
    else if (x.volumeMl !== y.volumeMl || x.count !== y.count) { level = 'different_spec'; reasons.push('容量或盒数不同，不能直接比价'); }
    else if (a.facts.brand && a.facts.brand === b.facts.brand && a.facts.series && a.facts.series === b.facts.series) {
      level = 'candidate_same'; reasons.push('标题中品牌、系列、容量和盒数一致');
    } else { level = 'same_spec_only'; reasons.push('包装规格一致，但品牌/系列未确认一致'); }
  } else if (category === 'bicycle') {
    if (a.facts.brand && a.facts.brand === b.facts.brand && a.facts.model && a.facts.model === b.facts.model) {
      level = 'candidate_same'; reasons.push('标题中品牌与型号一致');
      if ((a.facts.frame && b.facts.frame && a.facts.frame !== b.facts.frame)
        || (a.facts.wheel && b.facts.wheel && a.facts.wheel !== b.facts.wheel)) { level = 'different_spec'; reasons.push('尺码或轮径不同'); }
      else if (!a.facts.frame || !b.facts.frame || !a.facts.wheel || !b.facts.wheel) reasons.push('尺码/轮径未完整核实');
    } else reasons.push('品牌或型号未确认一致');
  } else reasons.push('通用品类尚不能自动确认同款，请核对型号和规格');
  if (a.facts.variant && b.facts.variant && a.facts.variant !== b.facts.variant) { level = 'different_spec'; reasons.push('品类/奶型不同'); }
  if (level === 'candidate_same' && a.facts.attributes !== b.facts.attributes) {
    level = 'same_spec_only'; reasons.push('有机/营养或车型配置属性不一致或缺失，需核实');
  }
  const completeSpec = category === 'milk' ? a.facts.variant && a.facts.variant === b.facts.variant
    : category === 'bicycle' && a.facts.frame && a.facts.frame === b.facts.frame && a.facts.wheel && a.facts.wheel === b.facts.wheel;
  const sameConditions = (a.product.priceNote || '') === (b.product.priceNote || '');
  if (!sameConditions) reasons.push('价格条件不同，不能作无条件价差比较');
  const priceDelta = level === 'candidate_same' && completeSpec && sameConditions && a.price !== null && b.price !== null
    && !a.facts.ambiguous && !b.facts.ambiguous ? Math.round((a.price - b.price) * 100) / 100 : null;
  return { jd: a.product, taobao: b.product, level, reasons, priceDelta };
}

/** Only candidates from preferred storefronts and compatible requested constraints participate. */
export function buildProductComparison(products, request) {
  const evaluated = products.map(p => evaluateProduct(p, request)).sort((a, b) => Number(Boolean(a.excluded.length)) - Number(Boolean(b.excluded.length)) || a.store.rank - b.store.rank);
  const eligible = evaluated.filter(p => p.store.preferred && !p.excluded.length);
  const jd = eligible.filter(p => p.product.siteId === 'site_jd');
  const tb = eligible.filter(p => p.product.siteId === 'site_taobao');
  const pairs = jd.flatMap(a => tb.map(b => comparePair(a, b, request.category)));
  const rank = { candidate_same: 0, same_spec_only: 1, similar: 2, different_spec: 3 };
  pairs.sort((a, b) => rank[a.level] - rank[b.level]);
  return { evaluated, pairs: pairs.slice(0, 8) };
}
