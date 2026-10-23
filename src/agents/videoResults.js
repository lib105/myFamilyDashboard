/** Only real video-detail URLs are accepted, never search pages or recipe pages. */
export function videoUrl(raw, siteId) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (siteId === 'site_bilibili'
      && ['www.bilibili.com', 'bilibili.com'].includes(url.hostname)
      && /^\/video\/(BV[0-9A-Za-z]+|av\d+)\/?$/.test(url.pathname)) {
      return `${url.origin}${url.pathname}`;
    }
    if (siteId === 'site_douyin'
      && ['www.douyin.com', 'douyin.com'].includes(url.hostname)
      && /^\/video\/\d+\/?$/.test(url.pathname)) {
      // IDs exceed Number.MAX_SAFE_INTEGER; always preserve them as strings.
      return `https://www.douyin.com/video/${url.pathname.split('/')[2]}`;
    }
    if (siteId === 'site_bing_video'
      && ['cn.bing.com', 'www.bing.com'].includes(url.hostname)
      && url.pathname === '/videos/riverview' && url.searchParams.has('mid')) return url.href;
    return null;
  } catch {
    return null;
  }
}

/** Preserve site search order; select the first valid, titled video. No quality claims. */
export function normalizeVideoCandidates(items, siteId) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap(item => {
    const url = videoUrl(item?.url, siteId);
    const title = typeof item?.title === 'string' ? item.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    if (!url || !title || seen.has(url)) return [];
    seen.add(url);
    return [{ title, url }];
  }).slice(0, 5);
}
