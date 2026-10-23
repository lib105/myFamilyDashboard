import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { getVideoPlayback, isPlainVideoClick } from '../src/components/common/videoPlayback.js';

const source = 'https://www.bilibili.com/video/BV1gT4y1m7ec/';

test('Bilibili video URLs use its official player without autoplay or danmaku', () => {
  const playback = getVideoPlayback(`${source}?p=2&autoplay=1`);
  const embed = new URL(playback.embedUrl);
  assert.equal(embed.origin, 'https://player.bilibili.com');
  assert.equal(embed.pathname, '/player.html');
  assert.equal(embed.searchParams.get('bvid'), 'BV1gT4y1m7ec');
  assert.equal(embed.searchParams.get('page'), '2');
  assert.equal(embed.searchParams.get('autoplay'), '0');
  assert.equal(embed.searchParams.get('danmaku'), '0');
  assert.equal(playback.url, `${source}?p=2&autoplay=1`);
});

test('Douyin links open the official player and keep the full string video ID', () => {
  const source = 'https://www.douyin.com/video/7574037689771593006?utm_source=share';
  const playback = getVideoPlayback(source);
  const embed = new URL(playback.embedUrl);
  assert.equal(playback.url, 'https://www.douyin.com/video/7574037689771593006');
  assert.equal(embed.origin, 'https://open.douyin.com');
  assert.equal(embed.pathname, '/player/video');
  assert.equal(embed.searchParams.get('vid'), '7574037689771593006');
  assert.equal(embed.searchParams.get('autoplay'), '0');
  assert.equal(getVideoPlayback('https://www.douyin.com.evil.test/video/7574037689771593006'), null);
  assert.equal(getVideoPlayback('https://www.douyin.com/search/x?modal_id=7574037689771593006'), null);
});

test('legacy av IDs and malformed page numbers are normalized', () => {
  const legacy = new URL(getVideoPlayback('https://www.bilibili.com/video/av12345/').embedUrl);
  assert.equal(legacy.searchParams.get('aid'), '12345');
  assert.equal(legacy.searchParams.get('bvid'), null);
  for (const page of ['-1', '0', '1000000', 'bad', '1.5']) {
    assert.equal(new URL(getVideoPlayback(`${source}?p=${page}`).embedUrl).searchParams.get('page'), '1');
  }
});

test('unknown and unsafe URLs cannot become iframe players; Bing has an external-only fallback', () => {
  for (const url of [undefined, '', 'javascript:alert(1)', 'data:text/html,x',
    'https://www.bilibili.com.evil.example/video/BV123', 'https://player.bilibili.com.evil.example/',
    'http://www.bilibili.com/video/BV123', 'https://user:pass@www.bilibili.com/video/BV123',
    'https://search.bilibili.com/all?keyword=foo', 'https://example.org/video/BV123']) {
    assert.equal(getVideoPlayback(url), null);
  }
  const bing = 'https://cn.bing.com/videos/riverview?mid=12345';
  assert.deepEqual(getVideoPlayback(bing), { url: bing, embedUrl: null });
});

test('only ordinary primary clicks open a dialog; modified/middle clicks keep normal link behavior', () => {
  assert.equal(isPlainVideoClick({ button: 0 }), true);
  for (const event of [{ button: 1 }, { button: 2 }, { button: 0, ctrlKey: true },
    { button: 0, metaKey: true }, { button: 0, shiftKey: true }, { button: 0, altKey: true },
    { button: 0, defaultPrevented: true }]) {
    assert.equal(isPlainVideoClick(event), false);
  }
});

let server, VideoPlayerProvider, VideoLink, Markdown;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  ({ VideoPlayerProvider, VideoLink } = await server.ssrLoadModule('/src/components/common/VideoPlayer.jsx'));
  ({ default: Markdown } = await server.ssrLoadModule('/src/components/common/Markdown.jsx'));
});
after(async () => { await server?.close(); });

test('result links retain hrefs and declare the player dialog; ordinary links are unchanged', () => {
  const markup = renderToStaticMarkup(createElement(VideoPlayerProvider, null,
    createElement(VideoLink, { href: source, target: '_blank', rel: 'noopener noreferrer' }, '八段锦教学'),
    createElement(VideoLink, { href: 'https://example.org', target: '_blank' }, '普通链接')));
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, /href="https:\/\/www.bilibili.com\/video\/BV1gT4y1m7ec\/"/);
  assert.equal((markup.match(/aria-haspopup/g) || []).length, 1);
  assert.ok(!markup.includes('<iframe'), 'player is not loaded before the user opens it');
});

test('Markdown video links use the same dialog entry point', () => {
  const markup = renderToStaticMarkup(createElement(VideoPlayerProvider, null,
    createElement(Markdown, { text: `[八段锦教学](${source})` })));
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, /八段锦教学/);
});
