/** Evidence is local server capture, never a product illustration or an arbitrary external image URL. */
export function normalizePriceEvidence(raw, product) {
  if (!raw || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw.id || '')
    || raw.imageUrl !== `/api/price-evidence/${raw.id}.png` || raw.captureKind !== 'product-card'
    || !/^[0-9a-f]{64}$/.test(raw.sha256 || '') || !Number.isFinite(Date.parse(raw.observedAt))
    || raw.sku !== product.sku || raw.productUrl !== product.url || raw.title !== product.title
    || raw.priceText !== product.priceText || raw.priceNote !== product.priceNote || raw.shop !== product.shop
    || JSON.stringify(raw.promotions || []) !== JSON.stringify(product.promotions || [])) return null;
  try {
    const source = new URL(raw.sourceUrl);
    if (source.protocol !== 'https:' || source.hostname !== 'search.jd.com' || source.username || source.password || source.port) return null;
  } catch { return null; }
  return { id: raw.id, imageUrl: raw.imageUrl, captureKind: raw.captureKind, sha256: raw.sha256,
    observedAt: raw.observedAt, sourceUrl: raw.sourceUrl, sku: product.sku, productUrl: product.url,
    title: product.title, priceText: product.priceText, priceNote: product.priceNote, shop: product.shop, promotions: product.promotions };
}
