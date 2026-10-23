/** Self-contained public DOM reader; supports JD's observed data-sku cards and classic search cards. */
export function readJDSearchPage() {
  const bodyText = document.body?.innerText || '';
  const hostname = location.hostname;
  if (hostname === 'verify.jd.com' || /请完成安全验证|请完成下方验证|拖动滑块|访问过于频繁|抱歉由于访问频繁导致无法搜索/.test(bodyText)) {
    return { items: [], blocker: 'verification_required' };
  }
  if (hostname === 'passport.jd.com' || /请登录后查看|请先登录后|登录后才能搜索/.test(bodyText)) {
    return { items: [], blocker: 'login_required' };
  }
  if (hostname !== 'search.jd.com') return { items: [], blocker: null };

  // Do not harvest clipped/hidden coupons. Off-screen but rendered rows are allowed.
  const shown = element => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      if (node !== element) {
        const clip = node.getBoundingClientRect();
        if (/(hidden|clip|scroll|auto)/.test(style.overflowX)
          && (rect.right <= clip.left || rect.left >= clip.right)) return false;
        if (/(hidden|clip|scroll|auto)/.test(style.overflowY)
          && (rect.bottom <= clip.top || rect.top >= clip.bottom)) return false;
      }
    }
    return true;
  };
  const read = element => shown(element) ? (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim() : '';
  const items = [];
  for (const card of document.querySelectorAll('[data-sku]')) {
    const sku = card.getAttribute('data-sku');
    if (!/^\d+$/.test(sku || '') || !shown(card)) continue;
    const titleNode = card.querySelector('[class*="_goods_title_container_"] [title], .p-name em, [class*="_goods_title_container_"]');
    const title = read(titleNode);
    if (!title) continue;
    const priceNode = card.querySelector('span[class*="_price_"], .p-price strong');
    const priceText = read(priceNode).replace(/\s+/g, '');
    const priceNote = read(card.querySelector('[class*="_subsidy_"]'));
    const referencePriceText = read(priceNode?.parentElement?.querySelector('[class*="_gray_"], del, .p-market'));
    const promotions = [...card.querySelectorAll('[class*="_textTag_"], .p-icons i, .p-icons span')]
      .map(read).filter(Boolean);
    const badges = [...card.querySelectorAll('img[alt]')].filter(shown)
      .map(image => image.getAttribute('alt') || '').filter(label => label.length > 0 && label.length <= 30);
    const shop = read(card.querySelector('[class*="_name_"] [class*="_limit_"], .p-shop a, .p-shop'));
    const isAd = /(?:^|\n)\s*广告\s*(?:\n|$)/.test(card.innerText || '');
    items.push({ sku, url: `https://item.jd.com/${sku}.html`, title, priceText, priceNote, referencePriceText, promotions, badges, shop, isAd });
    if (items.length >= 10) break;
  }
  return { items, blocker: null };
}
