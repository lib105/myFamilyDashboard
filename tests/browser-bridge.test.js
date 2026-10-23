import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEgoHandler, validateSearchRequest, buildBrowserScript, probeEgo, searchWithEgo } from '../server/egoBridge.js';
import { normalizeVideoCandidates } from '../src/agents/videoResults.js';
import { readVideoSearchPage } from '../server/videoSearchPage.js';
import { resolveBrowserSite, runEgoBrowserSearch, searchVideoWithBrowser } from '../src/agents/browserAgent.js';
import { KnowledgeGraph } from '../src/ontology/graph.js';

const candidate = { title: '八段锦完整版教学', url: 'https://www.bilibili.com/video/BV1gT4y1m7ec/' };
const live = { engine: 'ego-browser-live', candidates: [candidate] };
const fetchHttp = globalThis.fetch;
let server, base, requests = 0;
let searchFn = async request => { requests++; return { ...live, query: request.query }; };
before(async () => {
  server = createServer(createEgoHandler({
    token: 'test-server-secret',
    search: request => searchFn(request),
    probe: async () => ({ bridge: 'ok', runtime: 'ready' }),
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  globalThis.fetch = fetchHttp;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
const post = (payload, headers = {}) => fetchHttp(`${base}/api/ego-browser/search-video`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ego-bridge-token': 'test-server-secret', ...headers },
  body: JSON.stringify(payload),
});

test('server: health and search work outside Vite; URLs are constructed server-side', async () => {
  const health = await fetchHttp(`${base}/api/ego-browser/health`, { headers: { 'x-ego-bridge-token': 'test-server-secret' } });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).runtime, 'ready');
  const response = await post({ siteId: 'site_bilibili', query: '八段锦教学' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).candidates[0].url, candidate.url);
  const request = validateSearchRequest({ siteId: 'site_bilibili', query: '八段锦 教学' });
  assert.equal(new URL(request.searchUrl).hostname, 'search.bilibili.com');
  assert.equal(new URL(request.searchUrl).searchParams.get('keyword'), '八段锦 教学');
});

test('server: rejects untrusted site, client URLs/scripts, invalid JSON/query, wrong method and no auth', async () => {
  const initial = requests;
  for (const [body, status] of [
    [{ siteId: 'localhost', query: 'x' }, 403],
    [{ siteId: 'site_bilibili', query: 'x', searchUrl: 'http://127.0.0.1/admin' }, 400],
    [{ siteId: 'site_bilibili', query: 'x', script: 'process.exit()' }, 400],
    [{ siteId: 'site_bilibili', query: '' }, 400],
    [{ siteId: 'site_bilibili', query: 'x'.repeat(201) }, 400],
    [{ siteId: 'site_bilibili', query: 'x'.repeat(5000) }, 413],
    [null, 400],
    [{ siteId: 'site_xiachufang', query: '菜谱' }, 422],
  ]) assert.equal((await post(body)).status, status);
  assert.equal((await post({ siteId: 'site_bilibili', query: 'x' }, { 'x-ego-bridge-token': '' })).status, 401);
  assert.equal((await post({ siteId: 'site_bilibili', query: 'x' }, { Origin: 'https://evil.example' })).status, 403);
  const badJson = await fetchHttp(`${base}/api/ego-browser/search-video`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ego-bridge-token': 'test-server-secret' }, body: '{',
  });
  assert.equal(badJson.status, 400);
  assert.equal((await fetchHttp(`${base}/api/ego-browser/search-video`, { headers: { 'x-ego-bridge-token': 'test-server-secret' } })).status, 405);
  assert.equal(initial, requests);
});

test('server: no false successes on CLI failure; concurrent browser work is rejected', async () => {
  searchFn = async () => { throw Object.assign(new Error('CLI not ready'), { status: 503, code: 'CLI_NOT_FOUND' }); };
  const failed = await post({ siteId: 'site_bilibili', query: 'x' });
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).code, 'CLI_NOT_FOUND');
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  searchFn = async () => {
    entered();
    await new Promise(resolve => { release = resolve; });
    return live;
  };
  const pending = post({ siteId: 'site_bilibili', query: 'first' });
  await started;
  try { assert.equal((await post({ siteId: 'site_bilibili', query: 'second' })).status, 429); }
  finally { release(); }
  assert.equal((await pending).status, 200);
});

test('Douyin is server-allowlisted, keywords are encoded, and only genuine numeric video-detail URLs survive', async () => {
  const input = validateSearchRequest({ siteId: 'site_douyin', query: '番茄炒蛋 / 教学' });
  const search = new URL(input.searchUrl);
  assert.equal(search.hostname, 'www.douyin.com');
  assert.equal(search.searchParams.get('type'), 'video');
  assert.equal(decodeURIComponent(search.pathname.slice('/search/'.length)), '番茄炒蛋 / 教学');
  const url = 'https://www.douyin.com/video/7574037689771593006';
  const items = [
    { title: '八段锦跟练', url: `${url}?from=search` },
    { title: 'duplicate', url },
    { title: 'wrong host', url: 'https://www.douyin.com.evil.test/video/7574037689771593006' },
    { title: 'search page', url: 'https://www.douyin.com/search/八段锦?type=video' },
    { title: 'profile', url: 'https://www.douyin.com/user/test' },
    { title: 'not a numeric ID', url: 'https://www.douyin.com/video/not-a-video' },
  ];
  assert.deepEqual(normalizeVideoCandidates(items, 'site_douyin'), [{ title: '八段锦跟练', url }]);
  searchFn = async () => ({ engine: 'ego-browser-live', candidates: [{ title: '八段锦跟练', url }] });
  const response = await post({ siteId: 'site_douyin', query: '八段锦教学' });
  assert.equal(response.status, 200);
});

test('Douyin DOM reader extracts observed captions, not thumbnails, search pages or profile links', () => {
  const originalDocument = globalThis.document;
  const anchor = (href, caption) => ({
    href, innerText: '11:47 13.4万 ' + caption,
    getAttribute: () => null,
    querySelector: selector => selector.includes('.VDYK8Xd7') ? { textContent: caption } : null,
  });
  globalThis.document = {
    body: { innerText: '抖音 视频 搜索' },
    querySelectorAll: () => [
      anchor('https://www.douyin.com/user/test', '个人主页'),
      anchor('https://www.douyin.com/video/7574037689771593006', '八段锦完整跟练'),
      anchor('https://www.douyin.com.evil.test/video/7574037689771593006', '伪造链接'),
    ],
  };
  try {
    assert.deepEqual(readVideoSearchPage('site_douyin'), { items: [{ title: '八段锦完整跟练', url: 'https://www.douyin.com/video/7574037689771593006' }], blocker: null });
    globalThis.document.body.innerText = '请完成安全验证';
    assert.deepEqual(readVideoSearchPage('site_douyin'), { items: [], blocker: 'verification_required' });
    globalThis.document.body.innerText = '请登录后搜索';
    assert.deepEqual(readVideoSearchPage('site_douyin'), { items: [], blocker: 'login_required' });
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('result contract: reject search pages, lookalike domains and scripts; preserve video IDs in Bing query', () => {
  const bad = [
    'https://search.bilibili.com/all?keyword=x', 'https://www.bilibili.com.evil.test/video/BV1xx',
    'javascript:alert(1)', 'http://www.bilibili.com/video/BV1xx',
  ].map(url => ({ title: 'not a video', url }));
  assert.deepEqual(normalizeVideoCandidates([...bad, candidate, candidate], 'site_bilibili'), [candidate]);
  const bing = { title: 'Bing video', url: 'https://cn.bing.com/videos/riverview?mid=12345' };
  assert.deepEqual(normalizeVideoCandidates([bing], 'site_bing_video'), [bing]);
});

test('CLI adapter closes stdin and parses sandbox output sent to stderr', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'family-ego-cli-'));
  const cliPath = join(dir, 'fake-ego');
  const output = `__FAMILY_EGO_JSON__${JSON.stringify({ items: [candidate] })}`;
  // Deliberately wait for stdin EOF and emit to stderr, matching the installed CLI.
  await writeFile(cliPath, `#!/usr/bin/env node\nprocess.stdin.resume();\nprocess.stdin.on('end', () => { console.error('FAMILY_EGO_READY'); console.error(${JSON.stringify(output)}); });\n`, { mode: 0o700 });
  try {
    assert.equal((await probeEgo({ cliPath })).runtime, 'ready');
    const result = await searchWithEgo(validateSearchRequest({ siteId: 'site_bilibili', query: '八段锦' }), { cliPath });
    assert.equal(result.bestUrl, candidate.url);
    assert.equal(result.engine, 'ego-browser-live');
    await assert.rejects(probeEgo({ cliPath: join(dir, 'missing') }), { code: 'CLI_NOT_FOUND' });
    const blocked = '__FAMILY_EGO_JSON__' + JSON.stringify({ code: 'BROWSER_NEEDS_ATTENTION', error: '网站要求安全验证，请手动处理' });
    await writeFile(cliPath, `#!/usr/bin/env node\nprocess.stdin.resume();\nprocess.stdin.on('end', () => console.error(${JSON.stringify(blocked)}));\n`);
    await assert.rejects(searchWithEgo(validateSearchRequest({ siteId: 'site_douyin', query: '八段锦' }), { cliPath }), { code: 'BROWSER_NEEDS_ATTENTION', status: 409 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('generated Douyin script returns real results or hands blocked work to the user', async () => {
  const script = buildBrowserScript({ ...validateSearchRequest({ siteId: 'site_douyin', query: '八段锦教学' }), taskName: 'unit-test' });
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction('taskSpace', 'console', script);
  for (const blocked of [false, true]) {
    const calls = [], output = [];
    const task = {
      spaceId: 'test-space',
      page: () => ({
        goto: async url => { assert.equal(new URL(url).hostname, 'www.douyin.com'); },
        waitForFunction: async () => {},
        evaluate: async () => blocked ? { items: [], blocker: 'verification_required' }
          : { items: [{ title: '八段锦跟练', url: 'https://www.douyin.com/video/7574037689771593006' }], blocker: null },
      }),
      handOff: async () => { calls.push('handoff'); },
      finish: async ({ keep }) => { assert.deepEqual(keep, []); calls.push('finish'); },
    };
    await execute(async () => task, { log: text => output.push(text) });
    const result = JSON.parse(output.find(line => line.startsWith('__FAMILY_EGO_JSON__')).slice('__FAMILY_EGO_JSON__'.length));
    assert.deepEqual(calls, [blocked ? 'handoff' : 'finish']);
    if (blocked) {
      assert.equal(result.code, 'BROWSER_NEEDS_ATTENTION');
      assert.equal(result.items, undefined);
    } else assert.equal(result.items[0].url, 'https://www.douyin.com/video/7574037689771593006');
  }
});

test('script uses fixed automation, unique owned space, observable wait and closes successful task', () => {
  const script = buildBrowserScript({ searchUrl: 'https://search.bilibili.com/all?keyword=x', siteId: 'site_bilibili', taskName: 'test-task-123' });
  assert.match(script, /taskSpace\("test-task-123"\)/);
  assert.match(script, /waitForFunction/);
  assert.match(script, /finish\(\{ keep: \[\] \}\)/);
  assert.ok(!script.includes('waitForTimeout'));
  assert.match(script, /task.handOff\(\)/, 'verification/login barriers must hand control to the user');
});

function fixture() {
  const graph = new KnowledgeGraph();
  graph.addEntity({ id: 'site_bilibili', type: 'BrowserSite', label: 'B站', synonyms: ['b站'], searchUrlTemplate: 'https://search.bilibili.com/all?keyword={query}' });
  graph.addEntity({ id: 'search_video_with_browser', type: 'Capability' });
  graph.addEntity({ id: 'agent_video', type: 'Agent' });
  graph.addTriple('search_video_with_browser', 'usesBrowserSite', 'site_bilibili');
  graph.addTriple('search_video_with_browser', 'providedBy', 'agent_video');
  return graph;
}

test('frontend: missing capability grants fail closed', () => {
  const graph = fixture();
  assert.equal(resolveBrowserSite(graph, 'missing'), undefined);
  assert.equal(resolveBrowserSite(graph, 'search_video_with_browser', 'evil.test'), undefined);
});

test('frontend: service errors, missing API and simulated links create failed run, not fake success', async () => {
  for (const response of [
    { ok: false, status: 503, json: async () => ({ error: 'ego-lite 未启动' }) },
    { ok: false, status: 404, json: async () => { throw new SyntaxError('HTML'); } },
    { ok: true, json: async () => ({ engine: 'ego-browser-SimulatedFallback', bestUrl: 'https://search.bilibili.com/all?keyword=x' }) },
    { ok: true, json: async () => ({ engine: 'ego-browser-live', candidates: [{ title: '搜索页', url: 'https://search.bilibili.com/all?keyword=x' }] }) },
  ]) {
    const graph = fixture();
    globalThis.fetch = async () => response;
    try {
      const result = await searchVideoWithBrowser({ query: '八段锦' }, { graph, capability: graph.getEntity('search_video_with_browser') });
      assert.match(result.reply, /视频搜索未完成/);
      const run = graph.findEntities('BrowserTaskRun')[0];
      assert.equal(run.status, 'failed');
      assert.equal(run.bestUrl, undefined);
      assert.ok(run.error);
    } finally { globalThis.fetch = fetchHttp; }
  }
});

test('frontend: network failure is actionable and live candidates succeed', async () => {
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  try { await assert.rejects(runEgoBrowserSearch({ site: { id: 'site_bilibili' }, query: 'x' }), /health/); }
  finally { globalThis.fetch = fetchHttp; }
  globalThis.fetch = async () => ({ ok: true, json: async () => live });
  try {
    const result = await runEgoBrowserSearch({ site: { id: 'site_bilibili' }, query: 'x' });
    assert.equal(result.bestUrl, candidate.url);
  } finally { globalThis.fetch = fetchHttp; }
});
