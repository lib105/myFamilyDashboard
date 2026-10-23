/**
 * Self-contained DOM reader, serialized into ego-browser's page context.
 * Read public search-result anchors only, never private APIs or hidden application state.
 */
export function readVideoSearchPage(siteId) {
  const text = document.body?.innerText || '';
  // Specific blocking instructions, not the ordinary navigation's "登录" label.
  if (/请完成安全验证|请完成下方验证|拖动滑块|拖动下方滑块|验证后继续/.test(text)) {
    return { items: [], blocker: 'verification_required' };
  }
  if (/请登录后搜索|登录后可查看搜索结果|登录后才能搜索/.test(text)) {
    return { items: [], blocker: 'login_required' };
  }
  const items = [];
  for (const anchor of document.querySelectorAll('a[href]')) {
    let url;
    try { url = new URL(anchor.href); } catch { continue; }
    if (url.protocol !== 'https:') continue;
    let caption;
    if (siteId === 'site_douyin') {
      if (!['www.douyin.com', 'douyin.com'].includes(url.hostname) || !/^\/video\/\d+\/?$/.test(url.pathname)) continue;
      // .VDYK8Xd7 observed on Douyin search cards; semantic alternatives precede it.
      // Fall back to the card's visible text if Douyin changes its CSS class names.
      caption = anchor.querySelector('[data-e2e="video-desc"], [data-e2e="search-card-video-caption"], .VDYK8Xd7');
    } else if (siteId === 'site_bilibili') {
      if (!['www.bilibili.com', 'bilibili.com'].includes(url.hostname) || !/^\/video\/(BV[0-9A-Za-z]+|av\d+)\/?$/.test(url.pathname)) continue;
      caption = anchor.querySelector('h3, h2');
    } else if (siteId === 'site_bing_video') {
      if (!['cn.bing.com', 'www.bing.com'].includes(url.hostname) || url.pathname !== '/videos/riverview') continue;
      caption = anchor.querySelector('h3, h2');
    } else continue;
    const title = (anchor.getAttribute('title') || caption?.textContent
      || (siteId === 'site_douyin' ? anchor.innerText : '') || '').replace(/\s+/g, ' ').trim();
    if (title) items.push({ title: title.slice(0, 200), url: anchor.href });
    if (items.length >= 30) break;
  }
  return { items, blocker: null };
}
