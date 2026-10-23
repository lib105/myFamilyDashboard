/** Serialized into ego's Node runtime. Only crop the exact SKU card, never the account/header/address. */
export async function capturePriceCards(page, items, directory, reader) {
  const results = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    try {
      const clip = await page.evaluate(sku => {
        const cards = [...document.querySelectorAll('[data-sku]')].filter(el => el.getAttribute('data-sku') === sku);
        const card = cards.find(el => ![...el.querySelectorAll('[data-sku]')].some(child => child.getAttribute('data-sku') !== sku));
        if (!card) return null;
        card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        const r = card.getBoundingClientRect();
        if (r.width < 50 || r.height < 50 || r.width > 1400 || r.height > 1400 || r.width * r.height > 1960000) return null;
        return { x: Math.max(0, r.x + scrollX), y: Math.max(0, r.y + scrollY), width: r.width, height: r.height };
      }, item.sku);
      if (!clip) continue;
      const before = (await page.evaluate(reader)).items.find(p => p.sku === item.sku);
      const matches = value => value && ['url', 'title', 'priceText', 'priceNote', 'shop'].every(key => (value[key] || '') === (item[key] || ''))
        && JSON.stringify(value.promotions || []) === JSON.stringify(item.promotions || []);
      if (!matches(before)) continue;
      const observedAt = new Date().toISOString();
      await page.screenshot({ path: directory + '/' + index + '.png', clip, scale: 'css' });
      const after = (await page.evaluate(reader)).items.find(p => p.sku === item.sku);
      if (matches(after)) results.push({ slot: index, sku: item.sku, observedAt });
    } catch {
      // A timeout may have late screenshot effects. No further captures/actions on this Page.
      break;
    }
  }
  return results;
}
