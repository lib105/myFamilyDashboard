import { normalizePriceEvidence } from './priceEvidence.js';

/** Only official item-detail URLs are accepted. URL/SKU IDs remain strings. */
export function jdProductUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'item.jd.com' || url.username || url.password || url.port) return null;
    const match = url.pathname.match(/^\/(\d+)\.html$/);
    return match ? `https://item.jd.com/${match[1]}.html` : null;
  } catch { return null; }
}

/** Historical snapshot normalization only. Taobao/Tmall browsing is disabled server-side. */
export function taobaoProductUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['item.taobao.com', 'detail.tmall.com'].includes(url.hostname)
      || url.username || url.password || url.port || url.pathname !== '/item.htm' || !/^\d+$/.test(url.searchParams.get('id') || '')) return null;
    const clean = new URL('/item.htm', url.origin);
    clean.searchParams.set('id', url.searchParams.get('id'));
    const sku = url.searchParams.get('skuId');
    if (/^\d+$/.test(sku || '')) clean.searchParams.set('skuId', sku);
    return clean.href;
  } catch { return null; }
}

const text = (value, limit = 200) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
const texts = values => [...new Set((Array.isArray(values) ? values : []).map(v => text(v, 100)).filter(Boolean))].slice(0, 8);
export const normalizeJDProducts = items => normalizeProducts(items, 'site_jd').slice(0, 5);

/** Pure read-model normalizer, not a permission check or browser entry point. */
export function normalizeProducts(items, siteId) {
  const cleanUrl = siteId === 'site_jd' ? jdProductUrl : siteId === 'site_taobao' ? taobaoProductUrl : () => null;
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap(item => {
    const url = cleanUrl(item?.url), title = text(item?.title);
    if (!url || !title || seen.has(url)) return [];
    seen.add(url);
    const product = {
      sku: siteId === 'site_jd' ? new URL(url).pathname.slice(1, -5) : new URL(url).searchParams.get('id'), url, title, siteId,
      priceText: text(item.priceText, 80), priceNote: text(item.priceNote, 120),
      referencePriceText: text(item.referencePriceText, 80), shop: text(item.shop, 120),
      promotions: texts(item.promotions), badges: texts(item.badges), isAd: item.isAd === true,
    };
    return [{ ...product, evidence: normalizePriceEvidence(item.evidence, product) }];
  }).slice(0, 10);
}
