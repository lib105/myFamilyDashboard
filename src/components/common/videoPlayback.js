import { videoUrl } from '../../agents/videoResults.js';

/** Build an allowlisted player URL, never embed an arbitrary page or user-provided iframe. */
export function getVideoPlayback(raw) {
  const bilibiliUrl = videoUrl(raw, 'site_bilibili');
  if (bilibiliUrl) {
    const id = new URL(bilibiliUrl).pathname.split('/')[2];
    const params = new URLSearchParams({ autoplay: '0', danmaku: '0' });
    params.set(id.startsWith('BV') ? 'bvid' : 'aid', id.startsWith('BV') ? id : id.slice(2));
    const page = Number(new URL(raw).searchParams.get('p') || 1);
    params.set('page', String(Number.isInteger(page) && page > 0 && page <= 999 ? page : 1));
    return {
      url: raw,
      embedUrl: `https://player.bilibili.com/player.html?${params}`,
    };
  }
  const douyinUrl = videoUrl(raw, 'site_douyin');
  if (douyinUrl) {
    const id = new URL(douyinUrl).pathname.split('/')[2];
    const params = new URLSearchParams({ vid: id, autoplay: '0' });
    return { url: douyinUrl, embedUrl: `https://open.douyin.com/player/video?${params}` };
  }
  const bingUrl = videoUrl(raw, 'site_bing_video');
  // Bing's result URL is not a documented embeddable video player.
  return bingUrl ? { url: bingUrl, embedUrl: null } : null;
}

export function isPlainVideoClick(event) {
  return !event.defaultPrevented && event.button === 0
    && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
